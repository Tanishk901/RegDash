# RegDash

**The RegCreate support team's open work, in one view.** See what's open, what's breaching, who owns it, what it's waiting on and what happens next.

![Node 22.9+](https://img.shields.io/badge/Node-22.9%2B-339933?logo=node.js&logoColor=white)
![pnpm 10](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)
![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Express 4](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
  <img alt="RegDash dashboard: six gauges showing the share of tickets that need attention, above totals for open work" src="docs/screenshots/dashboard-light.png">
</picture>

<sub>All screenshots use generated mock data.</sub>

## Contents

[Features](#features) · [Quick start](#quick-start) · [Pages](#pages) · [Data sources](#data-sources) · [Architecture](#architecture) · [Commands](#commands) · [Before showing it to anyone](#before-showing-it-to-anyone) · [Roadmap](#roadmap)

Phase 1 (read-only dashboard) is complete. Phases 2 and 3 are in [Roadmap](#roadmap). Full Phase 1 requirements are in **[docs/PHASE-1.md](docs/PHASE-1.md)**.

## Features

| | |
|---|---|
| **Attention gauges** | Breached, at risk, stale, unassigned, on hold and high priority. Needles sweep when new data arrives, and clicking one opens its tickets. |
| **Ticket table** | Filter, search and sort, with filters kept in the URL so a view can be shared. Export the current view as CSV. |
| **Ticket detail** | Next action, blocker, timeline and an Open in ServiceNow link, in a panel beside the list. |
| **Team workload** | Open tickets per engineer, by priority and SLA state, with estimated effort. |
| **Excel upload** | Upload a tracker from the dashboard, with no config change or restart. |
| **Incident and SR detection** | Rules find the right sheet, columns and ticket type in a messy tracker, and show how the file was read. |
| **SLA that pauses** | Tickets waiting on someone outside the team show as Paused, not breached. |
| **Keeps working in an outage** | If a refresh fails, the last good data stays on screen with a clear error. |

<table>
  <tr>
    <td width="50%"><img alt="Ticket table filtered to P1 and P2" src="docs/screenshots/tickets.png"><br><sub><b>Tickets:</b> a gauge opens this list already filtered</sub></td>
    <td width="50%"><img alt="Ticket detail panel beside the list" src="docs/screenshots/ticket-detail.png"><br><sub><b>Ticket detail:</b> the next action comes first</sub></td>
  </tr>
  <tr>
    <td width="50%"><img alt="Open tickets per engineer" src="docs/screenshots/workload.png"><br><sub><b>Team workload:</b> see who's overloaded</sub></td>
    <td width="50%"><img alt="Panel explaining which sheets and columns were used for an uploaded file" src="docs/screenshots/file-reading.png"><br><sub><b>How this file was read:</b> check the rules' assumptions</sub></td>
  </tr>
</table>

## Quick start

Needs **Node 22.9+** and **pnpm** (`npm i -g pnpm` or `corepack enable`).

```bash
pnpm install
pnpm dev          # API on :4000, dashboard on http://localhost:5173
```

That runs on **mock data** with no setup, and no real company data is involved.

## Pages

| URL | Shows |
|---|---|
| `/` | Dashboard: totals and gauges. Click one to see its tickets |
| `/tickets` | Ticket table with filters |
| `/tickets/INC0012345` | The same table with that ticket's detail panel open |
| `/workload` | Open tickets per engineer |

## Data sources

> [!WARNING]
> Only upload real data, or point `excel` or `servicenow` at it, on your work machine, inside the company network. Never copy real ticket data to a personal device.

### Upload a tracker

Click **Upload Excel** and pick an `.xlsx` file (25 MB max). It becomes the live source, replacing whichever one is configured, until you click **Remove upload**.

- A copy is kept at `EXCEL_UPLOAD_PATH` (default `data/uploaded-tracker.xlsx`, git-ignored) so it survives an API restart. The file at `EXCEL_PATH` is never changed.
- A file that can't be read, or has no usable tickets, is refused with the reason, and the current data stays.
- The dashboard shows what was uploaded and when. It doesn't update until someone uploads a newer file.
- The upload applies to everyone viewing this API, and the API has no login, so keep it on the work machine or internal network.

### Configure a source

```bash
cp .env.example apps/api/.env
```

Then set `DATA_SOURCE` in `apps/api/.env`:

| Value | Reads from | Use for |
|---|---|---|
| `mock` (default) | generated fake tickets | development on any machine |
| `excel` | `EXCEL_PATH` (.xlsx) | a local or OneDrive-synced copy of the SharePoint tracker |
| `servicenow` | ServiceNow Table API | live data (needs a read-only service account) |

To try the Excel source with fake data, run `pnpm sample:excel`, which regenerates `data/sample-tickets.xlsx`, then set `DATA_SOURCE=excel`.

### How Excel files are understood

The tracker doesn't need restructuring. Rules work out:

- **Which sheets to read:** the `EXCEL_SHEET` sheet if there is one, otherwise every visible sheet with tickets, skipping archives and copies.
- **Which columns matter:** by name first, then by contents. A `Sr No` column counting 1, 2, 3 is not mistaken for service requests.
- **Incident or SR:** the type column, then the number prefix (`INC`, `RITM`, `REQ`, `SCTASK`, `SR`), then the sheet name. Rows that none of these can classify are rejected with a reason, not guessed.

These rules haven't yet been checked against the real tracker. After an upload, open **How this file was read** to see each decision. The full rules and column names are in [docs/PHASE-1.md §7](docs/PHASE-1.md).

## Architecture

```mermaid
flowchart LR
  subgraph Sources
    M[Mock]
    X[Excel tracker<br>configured or uploaded]
    S[ServiceNow<br>read-only]
  end
  Sources --> N[Normalize to<br>one Ticket shape]
  N --> C[In-memory cache<br>re-pulls on a timer]
  C --> A[Express REST API]
  A --> W[React dashboard]
```

```text
regdash/
├── apps/
│   ├── api/          Node + Express + TypeScript: sources, cache, REST API
│   └── web/          React + Vite + TypeScript: the dashboard
├── packages/
│   └── shared/       Ticket types, SLA and gauge logic shared by both apps
├── data/             Git-ignored, except the fake sample-tickets.xlsx
└── docs/             Requirements, design and screenshots
```

### Data flow

How a ticket moves from raw data to the screen:

```mermaid
flowchart TD
    subgraph Input
        E[Excel tracker .xlsx] -->|smart detection| P[Parse sheets & columns]
        SN[ServiceNow API] -->|REST call| F[Fetch incidents & SRs]
        MK[Mock generator] --> G[Generate fake tickets]
    end

    P --> N[Normalize]
    F --> N
    G --> N

    N -->|"one unified Ticket shape"| SLA[SLA engine<br>calculate state & breach time]
    SLA --> Cache[In-memory cache<br>auto-refresh on timer]
    Cache --> API[Express REST API]

    API --> Summary["/api/summary<br>gauge counts, workload"]
    API --> Tickets["/api/tickets<br>filtered, sorted list"]
    API --> Detail["/api/tickets/:id<br>single ticket"]
    API --> Export["/api/tickets.csv<br>CSV download"]
```

### Frontend components

```mermaid
flowchart TD
    App[App.tsx<br>router & layout]
    App --> Dash[Dashboard Page]
    App --> TL[Tickets Page]
    App --> WL[Workload Page]

    Dash --> SC[SummaryCards<br>open/closed/total counts]
    Dash --> GA[Gauges<br>six attention gauges]
    Dash --> EU[ExcelUpload<br>upload & manage tracker]
    Dash --> SRP[SourceReadingPanel<br>how the file was read]

    TL --> FI[Filters<br>type, status, priority, SLA, search]
    TL --> TT[TicketTable<br>sortable rows with badges]
    TL --> TD[TicketDetail<br>side panel with timeline]

    WL --> WC[Workload<br>per-engineer breakdown]

    TT --> BA[Badges<br>priority, SLA, type pills]
    TD --> BA
```

### User navigation

```mermaid
flowchart LR
    Start([Open RegDash]) --> Home[Dashboard<br>gauges + totals]

    Home -->|click a gauge| Filtered[Tickets<br>pre-filtered to that gauge]
    Home -->|click Tickets nav| All[Tickets<br>all open work]
    Home -->|click Workload nav| Work[Workload<br>per-engineer view]
    Home -->|click Upload Excel| Upload[Upload .xlsx tracker]

    All -->|search, filter, sort| Refined[Refined ticket list]
    Refined -->|click a row| Detail[Ticket detail panel]
    Refined -->|click Export CSV| CSV[Download CSV]
    Detail -->|click Open in ServiceNow| SNow([ServiceNow])

    Upload -->|file accepted| Home
```

### Phase progression

How the system grows across phases:

```mermaid
flowchart LR
    subgraph Phase1["Phase 1 — Visibility ✅"]
        direction TB
        P1A[Mock / Excel data]
        P1B[Rule-based detection]
        P1C[Gauges, table, detail]
        P1D[SLA engine]
        P1E[CSV export]
    end

    subgraph Phase2["Phase 2 — Live Data & Collaboration"]
        direction TB
        P2A[ServiceNow live API]
        P2B[Comments & assignments]
        P2C[Write-back to ServiceNow]
        P2D[Auth & SSO]
    end

    subgraph Phase3["Phase 3 — Automation"]
        direction TB
        P3A[Outlook / Teams emails]
        P3B[Mailbox ingestion]
        P3C[Custom dashboard builder]
    end

    subgraph Phase4["Phase 4 — AI Copilot"]
        direction TB
        P4A[RAG over SOPs]
        P4B[Resolution suggestions]
        P4C[Auto-triage]
    end

    Phase1 --> Phase2 --> Phase3 --> Phase4
```

<details>
<summary><b>REST API</b></summary>

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Source, last refresh, errors, rejected rows, how a file was read |
| `POST /api/refresh` | Re-pull from the source now |
| `GET /api/summary` | Counts for the dashboard and workload |
| `GET /api/tickets` | List. Filters: `type`, `status`, `priority`, `sla`, `stale`, `assignedTo`, `q`, `includeClosed`, `sort`, `dir` |
| `GET /api/tickets.csv` | The same list and filters, as a CSV download |
| `GET /api/tickets/:number` | One ticket |
| `POST /api/upload?fileName=` | Upload a tracker (raw `.xlsx` body) |
| `DELETE /api/upload` | Remove the upload and return to the configured source |

</details>

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API + web with hot reload |
| `pnpm dev:api` / `pnpm dev:web` | one side only |
| `pnpm test` | unit tests (normalization, sources, API, SLA, gauges) |
| `pnpm typecheck` | strict TypeScript across all packages |
| `pnpm build` | typecheck + production build of the web app |
| `pnpm sample:excel` | regenerate the sample tracker workbook |
| `pnpm sn:check` | read-only ServiceNow connection check (work machine, needs `SERVICENOW_*` in `.env`) |

## Before showing it to anyone

- [x] Replace the placeholder SLA hours in `packages/shared/src/sla.ts` with the team's real SLA matrix.
- [x] Replace the placeholder gauge limits (`GAUGE_LIMITS` in `packages/shared/src/gauges.ts`) with the limits the team agrees on.
- [ ] Check how the real tracker is read, using **How this file was read**.
- [ ] Agree the `Next:` / `Blocker:` / `Pending:` work-note convention if you're using the ServiceNow source.

## Roadmap

```mermaid
gantt
    title RegDash Phases
    dateFormat YYYY-MM
    axisFormat %b %Y
    section Phase 1 — Visibility
        React dashboard + mock/Excel data     :done, p1a, 2026-07, 2026-10
        Rule-based SR & Incident detection     :done, p1b, 2026-08, 2026-10
        SLA engine & attention gauges          :done, p1c, 2026-08, 2026-10
    section Phase 2 — Live Data & Collaboration
        Comments & ticket assignment           :p2a, 2026-11, 2027-02
        ServiceNow live data integration       :p2b, 2026-12, 2027-03
        Write-back to ServiceNow               :p2c, 2027-01, 2027-03
        Export from any filtered view          :p2d, 2027-01, 2027-03
    section Phase 3 — Automation
        Outlook/Teams auto-emails              :p3a, 2027-03, 2027-06
        Mailbox ingestion & auto-ticket        :p3b, 2027-04, 2027-07
        Custom dashboard builder               :p3c, 2027-04, 2027-07
        Bulk mail & notification system        :p3d, 2027-04, 2027-07
    section Phase 4 — AI Copilot
        RAG over SOPs & past tickets           :p4a, 2027-07, 2027-10
        Resolution suggestions with sources    :p4b, 2027-08, 2027-11
```

### Phase 1 — Read-only Dashboard (current) ✅

> A React dashboard on mock data or an uploaded Excel tracker, with rule-based keyword detection to accurately identify SRs and Incidents. Built to be **replaceable and implementable for any project**, not just RegCreate.

| Delivered | Status |
|---|---|
| Six attention gauges (breached, at risk, stale, unassigned, on hold, high priority) | ✅ Done |
| Filterable, sortable ticket table with shareable URL filters | ✅ Done |
| Ticket detail panel (next action, blocker, timeline, ServiceNow link) | ✅ Done |
| Team workload view (per-engineer breakdown by priority and SLA) | ✅ Done |
| Excel upload with smart sheet/column/ticket-type detection | ✅ Done |
| SLA engine with pause-on-external-wait logic | ✅ Done |
| CSV export of the current filtered view | ✅ Done |
| Real 16×5 SLA matrix from team agreement | ✅ Done |

Full requirements and design: **[docs/PHASE-1.md](docs/PHASE-1.md)**

### Phase 2 — Live Data and Collaboration

> Connect the dashboard to live ServiceNow data, let the team add comments and assign tickets, write back changes, and export any view.

| Planned | Description |
|---|---|
| **Comments and assignments** | Add and update comments on tickets directly from the dashboard. Assign or reassign tickets to team members without leaving the view. |
| **ServiceNow live integration** | Connect to ServiceNow Table API for real-time SR and Incident viewing. Auto-refresh on a configurable interval. Requires a read-only service account (or OAuth client) scoped to `incident` + `sc_req_item`. |
| **Write-back to ServiceNow** | Create and update tickets from the dashboard. No more switching to ServiceNow for routine status changes, reassignments or notes. |
| **Advanced export** | Export data from the current dashboard view or any selected filter combination. Support for CSV and Excel formats, with the ability to pick which columns to include. |
| **Authentication and SSO** | Add role-based access so the dashboard can be hosted beyond localhost. SSO (company identity provider) gates who can view, comment and assign. |

Full requirements and design: **[docs/PHASE-2.md](docs/PHASE-2.md)**

### Phase 3 — Automation and Custom Views

> Automate routine communication (Outlook, Teams), ingest the shared mailbox, and let users build any dashboard view by picking columns.

| Planned | Description |
|---|---|
| **Outlook and Teams auto-emails** | Automatically open Outlook/Teams to send reminder mails, acknowledgements, and welcome emails to users provisioned for the RegCreate application. |
| **Bulk and templated mails** | Send other kinds of emails (follow-ups, escalation notices, status updates) using configurable templates. |
| **Mailbox ingestion** | Classify incoming emails from the shared mailbox, auto-draft an INC or SR in ServiceNow, let a human review and approve, then send an acknowledgement to the requester. |
| **Custom dashboard builder** | Create any dashboard or view by selecting columns — for example, all tickets assigned to a person, with their SRs, Incidents, SLA state, and work progress side by side. |

Full requirements and design: **[docs/PHASE-3.md](docs/PHASE-3.md)**

### Phase 4 — Support Copilot

> An AI layer that learns from SOPs and past tickets to help engineers resolve issues faster.

| Planned | Description |
|---|---|
| **RAG over SOPs and past tickets** | Index standard operating procedures, resolution notes and historical tickets so engineers can search them in natural language from the dashboard. |
| **Resolution suggestions** | When viewing a ticket, the copilot suggests resolution steps based on similar past tickets and SOPs, always showing its sources so engineers can verify. |
| **Auto-triage** | Incoming tickets are scored by urgency and category, with a suggested assignment, before a human reviews. |

Full requirements and design: **[docs/PHASE-4.md](docs/PHASE-4.md)**
