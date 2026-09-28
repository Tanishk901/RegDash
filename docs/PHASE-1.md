# RegDash — Phase 1: Operations Dashboard

**Project:** RegDash (RegCreate Operations & Automation Dashboard)
**Phase:** 1 of 4. Visibility
**Owner:** Tanishk
**Status:** Scaffold built and running on mock and Excel data. ServiceNow adapter written but not yet tested against a live instance.
**Last updated:** 27 Sep 2026

---

## 1. Problem

The RegCreate support team has no single live view of its open work. Ticket status is spread across ServiceNow and a team tracker (Excel on SharePoint). Answering "what's open, who owns it, what is it waiting on, and what's the next step?" means opening several tickets one by one or asking in chat. SLA breaches are noticed late, and tickets that have gone quiet ("stale") are easy to miss.

## 2. Goal

One screen that answers these questions for any open incident or service request in under 10 seconds:

1. What's open right now, and how much of it is urgent?
2. What's about to breach, or has already breached, SLA?
3. Who owns each ticket, and who is it **waiting on**?
4. What is the **next action** on each ticket?

The data refreshes automatically from the source. **No one maintains data in RegDash by hand.**

## 3. Scope

### In scope (Phase 1)
- Read-only dashboard of open incidents (INC) and service requests (RITM / SR)
- Summary tiles, a filterable and sortable ticket list, and a ticket detail panel
- Three swappable data sources behind one interface: **mock**, **Excel**, **ServiceNow**
- Auto-refresh, SLA state, staleness flag
- Filtered views are shareable as URLs

### Out of scope (later phases)
- Writing back to ServiceNow or Excel (creating or updating tickets)
- Emails and notifications (Phase 2: access-provisioning mails)
- Mailbox ingestion and auto ticket creation (Phase 3)
- AI suggestions and RAG over SOPs and past tickets (Phase 4)
- Authentication and role-based access (see §9, open questions)

---

## 4. Users

| User | Needs |
|---|---|
| Support engineer | "What's on my plate, and what do I do next on each?" |
| Team lead | "What's breaching? What's stuck? Who's overloaded?" |
| Manager | A quick health check before stand-up or a client call |

---

## 5. Functional requirements

IDs are referenced in tests and commits.

### Dashboard (FR-1.x)
| ID | Requirement | Status |
|---|---|---|
| FR-1.1 | Show summary tiles: total open, incidents, SRs, SLA breached, SLA at risk, on hold, P1+P2, stale | ✅ |
| FR-1.2 | Clicking a tile filters the list to that set | ✅ |
| FR-1.3 | Show when the data was last refreshed and which source it came from | ✅ |
| FR-1.4 | Manual **Refresh** button forces a re-pull from the source | ✅ |
| FR-1.5 | Show a clear banner if the last refresh failed, while still displaying the last good data | ✅ |
| FR-1.6 | Show a warning listing any source rows that couldn't be read (never drop them silently) | ✅ |

### Ticket list (FR-2.x)
| ID | Requirement | Status |
|---|---|---|
| FR-2.1 | Columns: ticket no., type, summary, priority, status, SLA, owner, pending on, next action, age, last updated | ✅ |
| FR-2.2 | Show open tickets only by default; "Include closed" toggle | ✅ |
| FR-2.3 | Filter by type, status, priority, owner (including *Unassigned*), SLA state, stale | ✅ |
| FR-2.4 | Free-text search over number, summary, owner, pending owner, requester, next action | ✅ |
| FR-2.5 | Default sort is "needs attention": breached → at risk → OK, then P1→P4, then oldest | ✅ |
| FR-2.6 | Other sorts: priority, oldest first, least recently updated | ✅ |
| FR-2.7 | Filters are kept in the URL so a view can be shared or bookmarked | ✅ |
| FR-2.8 | Tickets with no update in 48h+ are visibly flagged | ✅ |

### Ticket detail (FR-3.x)
| ID | Requirement | Status |
|---|---|---|
| FR-3.1 | Clicking a row opens a detail panel; the URL `/tickets/INC…` links to it directly | ✅ |
| FR-3.2 | Detail shows next action, and for on-hold tickets the pending owner and blocker, prominently at the top | ✅ |
| FR-3.3 | Detail shows owner, group, requester, created, last updated, pending since, SLA due, source | ✅ |
| FR-3.4 | Detail shows the description and an activity timeline (newest first) | ✅ |
| FR-3.5 | Close with ×, Esc, or a click outside the panel | ✅ |

### Data (FR-4.x)
| ID | Requirement | Status |
|---|---|---|
| FR-4.1 | Source is chosen by config (`DATA_SOURCE=mock\|excel\|servicenow`) with no code change | ✅ |
| FR-4.2 | Every source produces the same normalized `Ticket` shape (`packages/shared/src/types.ts`) | ✅ |
| FR-4.3 | Messy values are normalized: "WIP", "Awaiting user", "1 - Critical", dd/mm/yyyy dates, Excel serial dates | ✅ |
| FR-4.4 | The API re-pulls from the source every N seconds (default 300) | ✅ |
| FR-4.5 | Excel: headers are matched by common aliases, so the existing tracker doesn't need restructuring | ✅ |
| FR-4.6 | Excel: rows missing a number, status or created date, or with a duplicate number, are rejected with a reason | ✅ |
| FR-4.7 | ServiceNow: read active `incident` and `sc_req_item` for the team's assignment group via the Table API, with paging | 🟡 written and unit-tested with a fake server; not yet run against a live instance |
| FR-4.8 | Excel: read the file directly from SharePoint via Microsoft Graph instead of a local or synced copy | ⏳ Phase 1.1 |

---

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **No real company data leaves approved systems.** Development on a personal machine uses mock data only. Real Excel or ServiceNow data is used only on the work machine, inside the network. |
| NFR-2 | Credentials live only in `apps/api/.env` (git-ignored) and are never committed or shown in the UI. |
| NFR-3 | Read-only. Phase 1 makes only `GET` requests to ServiceNow. |
| NFR-4 | Resilient: if a refresh fails, keep serving the last good data and report the error (FR-1.5). |
| NFR-5 | Dashboard loads in under 2s for up to 1,000 open tickets. API responses are served from an in-memory cache, not a live call per request. |
| NFR-6 | Works in current Edge and Chrome, at desktop and laptop widths, and stays usable on a phone. |
| NFR-7 | Light and dark mode follow the OS setting. |
| NFR-8 | The ticket table is keyboard-navigable (Tab / Enter), and the detail panel closes with Esc. |
| NFR-9 | Type-checked end to end (TypeScript strict); the API and normalization logic have unit tests. |

---

## 7. Data model and field mapping

The one shape the UI sees is `Ticket` in `packages/shared/src/types.ts`. The API adds derived fields (`ageHours`, `hoursSinceUpdate`, `sla`, `stale`) at read time.

| RegDash field | Excel column (any of these headers) | ServiceNow field |
|---|---|---|
| `number` | Number, Ticket, Ticket No, ID | `number` |
| `type` | Type (else inferred from INC/RITM prefix) | table: `incident` → INCIDENT, `sc_req_item` → SR |
| `shortDescription` | Short Description, Summary, Title | `short_description` |
| `status` | Status, State | `state` (display value) |
| `priority` | Priority, Severity | `priority` (display value, e.g. "2 - High") |
| `assignedTo` | Assigned To, Owner, Assignee | `assigned_to` |
| `assignmentGroup` | Assignment Group, Team | `assignment_group` |
| `pendingOwner` | Pending Owner, Pending With, Waiting On | work note `Pending: …`, else `hold_reason` |
| `blocker` | Blocker, Pending Reason, Hold Reason | work note `Blocker: …`, else `hold_reason` |
| `nextAction` | Next Action, Next Step | work note `Next: …` |
| `requestedBy` | Requested By, Caller, Requester | `caller_id` / `requested_for` / `opened_by` |
| `createdAt` | Created, Opened | `opened_at` |
| `updatedAt` | Last Updated, Updated | `sys_updated_on` |
| `pendingSince` | Pending Since | ⏳ needs `sys_audit`, Phase 1.1 |
| `slaDueAt` | SLA Due, Due Date | `due_date` (real SLAs live in `task_sla`, Phase 1.1) |
| `updates[]` | Latest Update, Comments, Remarks | `comments_and_work_notes` journal |
| `taskHours` | Avg Time, Time per Task, Time per Item, Effort (hand-entered; "30 min", "2h", "1d 4h", h:mm, or a bare number in `EXCEL_TIME_UNIT`) | none (Excel only) |
| `itemCount` | Items, No. of Items, Number of Items, Qty | none (Excel only) |

A trailing unit note in a header is ignored, so "Avg Time (hrs)" matches "Avg Time". The `taskHours` / `itemCount` aliases are guesses and must be checked against the real tracker.

Derived at read time: `pendingHours` (time since `pendingSince`, on-hold tickets only) and `estimatedHours` = `taskHours × itemCount` (only when both are recorded).

### Status vocabulary
`NEW` · `IN_PROGRESS` · `ON_HOLD` (waiting on someone outside the team) · `RESOLVED` · `CLOSED`
"Open" means NEW, IN_PROGRESS or ON_HOLD.

### The "next action" problem (important)
ServiceNow has **no native field** for *next action* or *blocker*, and those are the most useful columns on this dashboard. Phase 1 handles this in two ways:

- **Excel source:** use the tracker's own Next Action / Blocker / Pending With columns.
- **ServiceNow source:** a team convention. When updating a ticket, start a work-note line with
  `Next: …`, `Blocker: …` or `Pending: …`. RegDash reads the newest matching line.

This convention needs team buy-in, so raise it with the team lead early. If it doesn't stick, the fallback is a custom field on the form. That needs a ServiceNow admin, and it's the cleaner long-term answer.

### SLA rules
If the source provides a due date, RegDash uses it. Otherwise it applies **placeholder** defaults: P1 4h, P2 24h, P3 72h, P4 120h (`packages/shared/src/sla.ts`). "At risk" means 75% of the window has elapsed. **Replace these with the team's real SLA matrix before showing the dashboard to anyone.**

**Pending pauses the SLA.** The team puts tickets in a pending state while waiting on someone outside the team, and the SLA clock stops. RegDash shows `ON_HOLD` tickets as SLA **Paused**: never counted as breached or at risk, and sorted after everything the team can act on. When a ticket leaves pending, the clock should resume where it stopped. The Excel tracker has no pause history, so RegDash can't subtract earlier paused time yet and may overstate SLA use for tickets that were pending before. The ServiceNow source can fix this from `task_sla` (Phase 1.1).

---

## 8. Architecture

```
            ┌─────────────── apps/web (React + Vite) ───────────────┐
            │  Summary tiles · Filters · Ticket table · Detail panel │
            └───────────────────────────┬───────────────────────────┘
                                        │  /api/*  (JSON, polled every 60s)
            ┌───────────────────────────▼───────────────────────────┐
            │                apps/api (Node + Express)               │
            │  routes/tickets ─ query (filter/sort/summary)          │
            │  TicketStore: in-memory cache, refresh every N sec,    │
            │               keeps last good data on failure          │
            │  TicketSource interface                                │
            │    ├─ MockSource        (dev, no real data)            │
            │    ├─ ExcelSource       (tracker .xlsx)                │
            │    └─ ServiceNowSource  (Table API, read-only)         │
            │  lib/normalize: status/priority/date/type cleanup      │
            └───────────────────────────┬───────────────────────────┘
                                        │
            packages/shared: Ticket types + SLA logic, used by both apps
```

**Key design decisions**
- **Adapter pattern for sources.** Moving from mock to real data is a config change, which is what makes it possible to build safely off the work machine.
- **Normalize at the edge.** Messy source strings become a strict vocabulary once, at ingestion. The UI never branches on "WIP" vs "In Progress".
- **Server-side cache instead of a live call per page view.** This protects ServiceNow from load, keeps the dashboard fast, and lets it survive source outages.
- **Shared types package.** The API and UI can't drift apart, and a field rename fails the typecheck.

### API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | source, ticket count, last refresh, last error, rejected rows |
| POST | `/api/refresh` | force a re-pull from the source |
| GET | `/api/summary` | tile counts, by priority, status and owner |
| GET | `/api/tickets` | list. Query: `type`, `status` (csv), `priority` (csv), `sla`, `stale`, `assignedTo` (`__unassigned` for none), `q`, `includeClosed`, `sort` (`sla\|priority\|age\|updated`), `dir` |
| GET | `/api/tickets.csv` | same filters as `/api/tickets`, as a CSV download |
| GET | `/api/tickets/:number` | one ticket with derived fields |

`/api/summary` → `byOwner` carries each owner's open tickets by priority, breached, at risk, on hold, stale and estimated effort (the **Team workload** tab). `/api/health` → `servicenowUrl` is set when `SERVICENOW_BASE_URL` is configured and enables "Open in ServiceNow" in the detail panel (`{base}/nav_to.do?uri=<table>.do?sysparm_query=number=<number>`, table from the INC / RITM / REQ / SCTASK prefix, not yet tried on the real instance).

**ServiceNow connection check:** `pnpm sn:check` makes one small read-only GET per table and reports login, table access, matching ticket count, missing fields and unrecognised state/priority values. Run it on the work machine before switching `DATA_SOURCE=servicenow`.

---

## 9. Open questions (take to the team lead)

1. **ServiceNow access:** can we get a read-only service account (or OAuth client) scoped to `incident` + `sc_req_item`? Who approves it?
2. **Graph / SharePoint:** is there an approved app registration for reading the tracker, or do we use a OneDrive-synced copy for now?
3. **Hosting:** where does this run so the team can open it? An internal VM, the existing RegCreate infra, or localhost only at first?
4. **Auth:** Phase 1 has none. Is "internal network only" acceptable for a read-only view, or is SSO needed from day one?
5. **SLA matrix:** what are the real resolution targets per priority, for incidents vs SRs?
6. **Next-action convention:** will the team adopt the `Next:` / `Blocker:` work-note prefix?
7. **Which SR table:** RITM (`sc_req_item`), or does the team work from `sc_task`?

---

## 10. Acceptance criteria (definition of done for Phase 1)

- [x] `pnpm dev` starts the API and web app; the dashboard renders on mock data with no setup
- [x] `DATA_SOURCE=excel` reads the sample workbook; bad rows appear in the warning banner
- [x] Summary tiles match the list counts; clicking a tile filters correctly
- [x] Detail panel opens from a click and from a direct URL
- [x] Refresh failure keeps old data and shows the error banner
- [x] Typecheck passes; unit tests pass (45 tests)
- [ ] SLA defaults replaced with the real team matrix
- [ ] Excel source tested against a copy of the **real** tracker on the work machine
- [ ] ServiceNow source tested against the real instance (read-only account)
- [ ] Demo to the team lead, and feedback captured

## 11. Milestones

| # | Milestone | Output |
|---|---|---|
| M1 | Scaffold + mock data | ✅ this repo |
| M2 | Map the real tracker's columns → run the Excel source at work | Dashboard on real data (work machine only) |
| M3 | Demo to lead + agree the SLA matrix and next-action convention | Feedback, approvals for ServiceNow and Graph access |
| M4 | ServiceNow source live | No more dependence on manual Excel updates |
| M5 | Host internally + share the link with the team | Phase 1 complete → start Phase 2 |

## 12. Phase 1.1 backlog (nice-to-have, after M5)
- Microsoft Graph download of the SharePoint workbook (FR-4.8)
- Real SLA data from `task_sla`; `pendingSince` from `sys_audit`
- Owner workload view (tickets per engineer, by priority)
- CSV export of the current filtered view
- "Deep link to ServiceNow" button on each ticket
