# Changelog

## 3.0.0 — Phase 3: Custom Dashboard Builder (2026-11-19)

### Custom views (FR-12.x)

- `DisplayColumn` type and `ALL_DISPLAY_COLUMNS` array — data-driven column definitions (22 columns)
- `TicketTable` refactored to render from column definitions; accepts `columns` and `groupBy` props
- Column picker dropdown in Filters bar — show/hide any column, stored in URL as `?columns=CSV`
- Group-by dropdown — group tickets by owner, priority, status, type, SLA, application, or environment
- `GroupByField` type and `GROUP_BY_FIELDS` constant in shared package
- `SavedView` and `SavedViewInput` types in shared package
- `ViewStore` class — JSON file persistence with safe-write (temp-file-then-rename)
- View CRUD API: `GET/POST/PUT/DELETE /api/views` with Zod validation
- Frontend API client: `api.views()`, `api.view()`, `api.createView()`, `api.updateView()`, `api.deleteView()`
- `ViewBuilder` component — column picker, sort/direction/group-by selects, name/description/pin fields, Escape to close, ARIA
- `ViewsPage` — list saved views as cards, create new views, pin/unpin and delete
- `CustomViewPage` — load a saved view by ID, run it against the ticket API, edit inline
- Pinned views appear as extra nav tabs in the Shell header
- Copy-link button on custom view pages
- Export from custom views respects the view's column selection as default columns
- CSS for all new components following existing design token system, responsive at 1000px and 720px
- 14 new tests (ViewStore unit + route integration)

## 2.1.0 — Phase 2b (2026-11-19)

### ServiceNow write-back
- `WritableTicketSource` interface: `addComment`, `updateAssignment`, `updateStatus`
- `ServiceNowSource` implements all three write methods via PATCH to Table API
- `request()` HTTP helper with auth, timeout, and error handling
- `recordIndex` map for ticket-number-to-sys_id lookups
- `teamMembers()` driven by `SERVICENOW_TEAM_MEMBERS` env var
- 14 new ServiceNow source tests (16 total, up from 2)

### Real SLA and pending time
- `TaskSlaRecord` type on `Ticket` for real `task_sla` stage data
- SLA engine uses real stage + AT_RISK refinement from remaining business time
- ServiceNow source batch-fetches `task_sla` records after ticket fetch
- Mock source generates synthetic `taskSlaRecords` (~60% of tickets)
- `pendingSince` queried from `sys_audit` for ON_HOLD tickets

### Auto-refresh
- Refresh interval is source-dependent: 60s (servicenow), 300s (excel/mock)
- Interval exposed via `/api/health` → `refreshIntervalSeconds`
- Frontend reads interval from health endpoint instead of hardcoded constant

### Documentation
- FR-6.2 (edit comment) marked as won't-do — ServiceNow journals are append-only
- Microsoft Graph / SharePoint architecture documented (FR-5.5, design only)
- FR status table updated; FR-8.x (auth/SSO) marked blocked on external teams

## 2.0.0 — Phase 2a (2026-11-19)

### Shared types
- `SlaPolicy`, `SlaKind`, `SlaPolicyEntry` — formal SLA policy model
- `computeSlaDetail()` and `computeDetailedSla()` — per-clock SLA computation
- `TicketSlaDetail` on `TicketView` — response and resolution SLA state
- `ApplicationCode`, `Environment` union types and arrays
- `Ticket.application`, `.environment`, `.configurationItem`, `.serviceOffering`
- `TicketFilters.application`, `.environment`
- `DashboardSummary.byApplication`, `.byEnvironment`
- `OwnerWorkload.actionable`
- `CommentKind` (`work_note` | `customer_comment`) on `TicketUpdate`

### API
- Application and environment filtering on `/tickets`
- Summary breakdown by application and environment on `/summary`
- `/summary.csv` and `/summary.xlsx` export endpoints
- Normalizers for application and environment aliases
- Comment kind accepted on `POST /tickets/:number/comments`
- Export columns: Application, Environment, Response SLA, Resolution SLA

### Web
- Application and Environment filter dropdowns
- SLA Detail Badge (response / resolution) in ticket detail and table
- Application column in ticket table
- Application and environment breakdown cards on dashboard
- Actionable column in workload table
- Source Status indicator (Current/Stale/Degraded/Unavailable/Mock/Uploaded)
- Comment kind toggle (Work note / Customer comment)
- Inline write confirmation (fades after 5s)
- Summary CSV and Excel export buttons on dashboard

### Data sources
- Mock source generates weighted application and environment values
- Excel source reads application, environment, config item, service offering
- ServiceNow source maps cmdb_ci and service_offering fields

## 1.0.0 — Phase 1

Initial release with ticket listing, detail panel, workload view, gauges,
SLA computation, CSV/XLSX export, Excel upload, and mock/Excel/ServiceNow sources.
