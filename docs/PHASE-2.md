# RegDash — Phase 2: Live Data and Collaboration

**Project:** RegDash (RegCreate Operations & Automation Dashboard)
**Phase:** 2 of 4. Live Data & Collaboration
**Version:** v2.0.0
**Owner:** Tanishk
**Status:** Not started. Phase 1 complete; ServiceNow adapter written but not yet tested against a live instance.
**Last updated:** 18 Nov 2026

---

## 1. Problem

Phase 1 gave the team a read-only dashboard on mock or uploaded Excel data. But the team still has to:
- Switch to ServiceNow to update tickets, add comments, or reassign work.
- Manually re-upload the Excel tracker whenever it changes.
- Share filtered views as CSVs with no way to pick which columns to include.
- Run the dashboard on localhost because there is no authentication.

## 2. Goal

A dashboard connected to live ServiceNow data that the team can act on — comment, assign, update status — without leaving RegDash. Filtered views can be exported in multiple formats, and authentication gates access so the dashboard can be hosted internally.

---

## 3. Scope

### In scope (Phase 2)
- ServiceNow live integration (real-time reading of incidents and SRs)
- Adding and updating comments on tickets from the dashboard
- Assigning and reassigning tickets to team members
- Writing back status changes, notes and assignments to ServiceNow
- Exporting any filtered view as CSV or Excel, with column selection
- Authentication via SSO (company identity provider)
- Role-based access: viewer, commenter, assigner

### Out of scope (later phases)
- Automated emails and notifications (Phase 3)
- Mailbox ingestion and auto-ticket creation (Phase 3)
- Custom dashboard builder (Phase 3)
- AI suggestions and RAG (Phase 4)

---

## 4. Users

| User | Needs |
|---|---|
| Support engineer | "I want to update a ticket's status and add a note without opening ServiceNow." |
| Team lead | "I need to reassign tickets and export a filtered report for the weekly review." |
| Manager | "I want to see live data, not yesterday's Excel upload, and I want SSO before we roll this out." |

---

## 5. Functional requirements

### ServiceNow live integration (FR-5.x)
| ID | Requirement | Status |
|---|---|---|
| FR-5.1 | Connect to ServiceNow Table API using a service account (or OAuth client) scoped to `incident` + `sc_req_item` | ⏳ |
| FR-5.2 | Auto-refresh on a configurable interval (default 60s for live, 300s for Excel fallback) | ⏳ |
| FR-5.3 | Real SLA data from `task_sla` instead of placeholder defaults | ⏳ |
| FR-5.4 | `pendingSince` from `sys_audit` for accurate pause-time calculation | ⏳ |
| FR-5.5 | Microsoft Graph download of the SharePoint workbook as an alternative to local/synced copy (FR-4.8 from Phase 1 backlog) | ⏳ |

### Comments and assignments (FR-6.x)
| ID | Requirement | Status |
|---|---|---|
| FR-6.1 | Add a comment (work note or customer-visible) to a ticket from the detail panel | ✅ (mock source; ServiceNow pending live access) |
| FR-6.2 | ~~Edit the most recent comment if it was posted by the current user~~ | ❌ Won't do — ServiceNow journals are append-only by design |
| FR-6.3 | Assign or reassign a ticket to a team member from a dropdown in the detail panel | ✅ (mock source; ServiceNow pending live access) |
| FR-6.4 | Update ticket status (e.g. In Progress → On Hold) from the detail panel | ✅ (mock source; ServiceNow pending live access) |
| FR-6.5 | All write-back operations update ServiceNow in real time and refresh the local cache | ✅ (write-through to source + cache reload) |
| FR-6.6 | Optimistic UI: show the change immediately, roll back if the ServiceNow write fails | ✅ |

### Advanced export (FR-7.x)
| ID | Requirement | Status |
|---|---|---|
| FR-7.1 | Export the current filtered/sorted ticket list as CSV (already in Phase 1) | ✅ |
| FR-7.2 | Export as Excel (.xlsx) with the same filters applied | ✅ |
| FR-7.3 | Column picker: choose which columns to include in the export | ✅ |
| FR-7.4 | Export directly from the dashboard view (summary data) as well as the ticket list | ⏳ |

### Authentication and SSO (FR-8.x)
| ID | Requirement | Status |
|---|---|---|
| FR-8.1 | SSO login via the company identity provider (SAML or OIDC) | ⏳ |
| FR-8.2 | Role-based access: Viewer (read-only), Editor (comment + assign), Admin (config) | ⏳ |
| FR-8.3 | Unauthenticated users are redirected to the login page | ⏳ |
| FR-8.4 | Session management with secure, HTTP-only cookies | ⏳ |

---

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-10 | Write-back operations must not block the UI; use optimistic updates with rollback on failure. |
| NFR-11 | ServiceNow writes use the same service account as reads; no escalated privileges. |
| NFR-12 | Export handles up to 5,000 rows without timeout. |
| NFR-13 | SSO integration must work with the company's existing identity provider — no separate user database. |
| NFR-14 | All API endpoints that modify data require authentication. Read endpoints remain available to authenticated users only once SSO is enabled. |

---

## 7. Architecture changes

```
Phase 1 (read-only):  Source → Normalize → Cache → REST API (GET) → React UI

Phase 2 adds:
  React UI → REST API (POST/PUT) → ServiceNow Table API (write-back)
  SSO provider → Express middleware → all routes
  Export engine → CSV / Excel generation from filtered query
```

### New API endpoints

| Method | Path | Purpose | Status |
|---|---|---|---|
| POST | `/api/tickets/:number/comments` | Add a comment to a ticket | ✅ |
| ~~PUT~~ | ~~`/api/tickets/:number/comments/:id`~~ | ~~Edit own comment~~ | ❌ Won't do |
| PUT | `/api/tickets/:number/assign` | Reassign a ticket | ✅ |
| PUT | `/api/tickets/:number/status` | Update ticket status | ✅ |
| GET | `/api/tickets.xlsx` | Export filtered list as Excel (with column selection via `?columns=`) | ✅ |
| GET | `/api/export-columns` | Available columns for export column picker | ✅ |
| GET | `/api/team` | Team members and writable flag | ✅ |
| GET | `/api/auth/login` | Initiate SSO flow | ⏳ |
| GET | `/api/auth/callback` | SSO callback | ⏳ |
| POST | `/api/auth/logout` | End session | ⏳ |

---

## 8. Microsoft Graph / SharePoint architecture (FR-5.5)

> **Status:** Design only — no code until an Azure app registration is granted.

### Overview

The team's Excel tracker lives on SharePoint. Today, users manually download or OneDrive-sync the file and either point `EXCEL_PATH` at it or upload it through the dashboard. FR-5.5 replaces that manual step with a server-side download via the Microsoft Graph API so the dashboard always reads the latest workbook.

### New source: `apps/api/src/sources/sharepoint.ts`

A thin wrapper that downloads the workbook, writes it to a temp file, and delegates parsing to the existing `ExcelSource`. It implements `TicketSource` (read-only, like `ExcelSource`).

```
class SharePointSource implements TicketSource {
  readonly name = "excel";           // same normalised source tag

  constructor(opts: SharePointOptions) { ... }

  async fetchTickets(): Promise<SourceResult> {
    const workbookPath = await this.downloadWorkbook();
    const excel = new ExcelSource(workbookPath, this.sheet, this.timeUnit);
    return excel.fetchTickets();
  }
}
```

### Authentication

OAuth 2.0 client-credential flow via `@azure/identity` (`ClientSecretCredential`):

| Config var | Purpose |
|---|---|
| `GRAPH_TENANT_ID` | Azure AD (Entra ID) tenant |
| `GRAPH_CLIENT_ID` | App registration client ID |
| `GRAPH_CLIENT_SECRET` | App registration client secret |
| `SHAREPOINT_SITE_ID` | SharePoint site (or site-relative path) |
| `SHAREPOINT_DRIVE_PATH` | Path within the document library, e.g. `General/RegCreate Tracker.xlsx` |

The app registration needs the **Files.Read.All** (application) Graph permission scoped to the target site.

### Download flow

```
1. Acquire token via ClientSecretCredential.getToken("https://graph.microsoft.com/.default")
2. Resolve drive item:
     GET /sites/{siteId}/drive/root:/{drivePath}
     → returns item metadata including @microsoft.graph.downloadUrl
3. Stream workbook bytes to a temp file
4. Delegate to ExcelSource for parsing
```

The download runs once per refresh cycle (every `REFRESH_INTERVAL_SECONDS`). The temp file is overwritten on each cycle, so disk usage stays constant.

### Source factory integration

A new `DATA_SOURCE` value `"sharepoint"` in `config.ts`:

```
case "sharepoint":
  return new SharePointSource({
    tenantId:   cfg.GRAPH_TENANT_ID,
    clientId:   cfg.GRAPH_CLIENT_ID,
    clientSecret: cfg.GRAPH_CLIENT_SECRET,
    siteId:     cfg.SHAREPOINT_SITE_ID,
    drivePath:  cfg.SHAREPOINT_DRIVE_PATH,
    sheet:      cfg.EXCEL_SHEET,
    timeUnit:   cfg.EXCEL_TIME_UNIT,
  });
```

### Dependencies

| Package | Purpose |
|---|---|
| `@azure/identity` | `ClientSecretCredential` for client-credential OAuth |
| `@microsoft/microsoft-graph-client` | Type-safe Graph API calls (optional — raw `fetch` with token header also works) |

### Open questions for implementation

1. **Site ID format:** full GUID (`{siteCollectionId},{siteId},{webId}`) vs. hostname path (`contoso.sharepoint.com:/sites/RegCreate`) — depends on the admin's preference.
2. **Drive vs. drive item ID:** some tenants lock down the Graph `search` endpoint; a direct path is more portable.
3. **Delta downloads:** Graph supports `@microsoft.graph.downloadUrl` which is a pre-authenticated CDN URL valid for a short window — no need to cache tokens across requests.

---

## 9. Open questions (general)

1. **Service account permissions:** can the existing read-only account be upgraded to allow writes, or do we need a separate account?
2. **SSO provider:** which identity provider does the company use — Azure AD (Entra ID), Okta, Ping?
3. **Role mapping:** are roles mapped from AD groups, or managed within RegDash?
4. **Comment visibility:** should dashboard comments be work notes (internal) or customer-visible by default?
5. **Hosting:** where will this be deployed now that it needs SSO?

---

## 10. Acceptance criteria

- [ ] Dashboard shows live ServiceNow data, refreshing automatically
- [ ] A user can add a comment from the detail panel and see it in ServiceNow
- [ ] A user can reassign a ticket and the change is reflected in both RegDash and ServiceNow
- [ ] Export as Excel works with column selection
- [ ] SSO login works; unauthenticated users cannot access the dashboard
- [ ] All Phase 1 features continue to work (regression)
- [ ] Typecheck passes; unit and integration tests pass

---

## 11. Dependencies

| Dependency | Owner | Status |
|---|---|---|
| ServiceNow service account with write access | ServiceNow admin | ⏳ Requested |
| SSO app registration | Identity team | ⏳ Not yet requested |
| Internal hosting environment | Infrastructure team | ⏳ Not yet requested |
| Microsoft Graph app registration (for SharePoint Excel) | Azure admin | ⏳ Not yet requested |
