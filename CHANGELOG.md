# Changelog

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
