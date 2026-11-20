# Changelog

## 5.0.0 — Phase 2+3 Completion (2026-11-20)

### Email automation (FR-9.x, FR-10.x)
- `EmailLogStore` with JSON persistence — tracks all sent emails (manual, bulk, automated)
- Merge field support: `{{ticket}}`, `{{assignee}}`, `{{priority}}`, `{{requester}}`, `{{sla_state}}` etc.
- `POST /api/emails/preview` — preview merged template with real ticket data or sample values
- `POST /api/emails/send` — send with merge field resolution and delivery logging
- `POST /api/emails/bulk` — bulk send a template to multiple tickets' requesters
- `GET /api/emails/log` — delivery log (filterable by ticket)
- `GET /api/emails/merge-fields` — available merge fields with labels and samples
- `EmailAutomation` service with configurable triggers:
  - `POST /api/automation/stale-reminders` — send reminders for stale tickets (configurable threshold)
  - `POST /api/automation/welcome` — send welcome email to new users
  - `POST /api/automation/acknowledge` — send acknowledgement for a ticket
  - `GET/PUT /api/automation/config` — toggle automation and configure thresholds
- Templates page enhanced with delivery log tab, automation controls tab, merge field reference
- Email compose modal with live merge field preview

### Bulk email (FR-10.3)
- Ticket table now has selection checkboxes (select all / individual)
- Bulk email bar: select tickets, choose template, send to all requesters
- Bulk send results shown with sent/failed counts

### Mailbox ingestion (FR-11.x)
- `EmailClassifier` — rule-based keyword classification (incident, service request, access request, general inquiry)
- `IngestStore` with JSON persistence — draft queue with pending/approved/rejected states
- `MockMailbox` — generates 5 sample emails for development
- Ingestion API routes:
  - `POST /api/ingestion/poll` — fetch new emails from mailbox, classify, and create drafts
  - `GET /api/ingestion/queue` — list drafts (filterable by status)
  - `GET /api/ingestion/stats` — pending/approved/rejected counts
  - `GET /api/ingestion/:id` — single draft detail
  - `PUT /api/ingestion/:id` — edit draft fields before review
  - `PUT /api/ingestion/:id/approve` — approve draft and generate ticket number
  - `PUT /api/ingestion/:id/reject` — reject draft with reason
- `IngestionPage` UI at `/ingestion` — stats cards, filterable queue table, draft review dialog
- Dashboard widget showing ingestion queue pending/approved/rejected counts

### Dashboard export (FR-7.4)
- Summary CSV and Excel export buttons on dashboard (completed in prior version, status updated)

### Tests
- 5 EmailLogStore tests (CRUD, filtering, persistence)
- 5 merge field tests (replacement, null handling, samples)
- 5 EmailClassifier tests (incident, access, SR, general classification)
- 8 IngestStore tests (CRUD, approve/reject, filtering, persistence)

### Navigation
- Templates tab renamed to "Email" (now includes templates, delivery log, automation)
- New "Ingestion" tab in nav bar

## 4.1.0 — Phase 4 Polish + Phase 3 Email (2026-11-19)

### Dark mode & UI polish
- Copilot/triage/search CSS migrated from hardcoded hex to CSS custom properties for dark mode
- Loading skeleton for triage queue page
- Empty state for suggestions panel
- Keyboard shortcut help dialog (press ?)
- Error boundary around SuggestionsPanel for graceful degradation

### Accessibility
- ARIA labels on triage table and search dropdown
- Debounce on triage run button to prevent double-clicks

### Triage improvements
- Triage status badge column in ticket table
- Bulk triage: select-all with approve/reject multiple (`PUT /api/triage/bulk`)
- Triage accuracy trend chart (last 7 days) with `GET /api/triage/trend`
- Export triage queue to CSV (`GET /api/triage/queue.csv`)

### Email templates (Phase 3)
- `EmailTemplate`, `EmailTemplateInput`, `EmailTemplateKind` types in shared package
- `TemplateStore` with JSON file persistence and CRUD
- Template CRUD API routes (`GET/POST/PUT/DELETE /api/templates`)
- Template management UI page at `/templates` with nav tab
- `EmailService` interface + `MockEmailService` adapter
- Email compose modal on ticket detail with template selection
- 6 TemplateStore tests

### Dashboard & copilot
- Copilot status (enabled/triage) in health endpoint and dashboard card
- Feedback stats panel (accept/dismiss/flag rates) on dashboard
- Similar tickets section in ticket detail from knowledge store
- Cache-Control header on knowledge status endpoint

### Documentation
- README updated with Phase 3 + Phase 4 pages, features and API endpoints

## 4.0.0 — Phase 4: Support Copilot (2026-11-19)

### RAG pipeline + knowledge store (FR-13.x)

- `EmbeddingProvider` interface + `MockEmbeddingProvider` (deterministic fake vectors)
- `LlmProvider` interface + `MockLlmProvider` (keyword-matched canned answers)
- `KnowledgeStore` interface with cosine-similarity search
- `InMemoryKnowledgeStore` — JSON persistence with safe-write pattern
- `KnowledgeIndexer` — indexes 8 mock SOPs + closed ticket notes on startup
- `GET /api/knowledge/search?q=` — NL search with ranked results and sources
- `GET /api/knowledge/status` — index stats (chunk count, by source, last indexed)
- `POST /api/knowledge/reindex` — manual re-index trigger
- Config: `KNOWLEDGE_PATH`, `LLM_PROVIDER`, `EMBEDDING_PROVIDER`

### Resolution suggestions (FR-14.x)

- `GET /api/tickets/:number/suggestions` — 1-2 suggestions with cited sources
- `POST /api/tickets/:number/suggestions/:id/feedback` — accept/dismiss/flag
- `FeedbackStore` — tracks feedback with JSON persistence
- `SuggestionsPanel` component in ticket detail — collapsible, source citations, action buttons
- Existing feedback shown on suggestion cards (accepted/dismissed/flagged badge)

### Auto-triage (FR-15.x)

- `TriageEngine` — keyword-based priority/category scoring + workload-balanced assignment
- `TriageStore` — queue persistence (pending/approved/rejected) with JSON safe-write
- `GET /api/triage/queue` — list triage suggestions (filterable by status)
- `GET /api/triage/stats` — total/pending/approved/rejected/accuracy
- `POST /api/triage/run` — run triage on new tickets
- `PUT /api/triage/:id/approve` and `PUT /api/triage/:id/reject`
- `TriageQueuePage` — table with approve/reject, stats dashboard, reasoning details
- Triage nav tab in shell header

### Global search (FR-13.4)

- `GlobalSearch` component in shell header
- Ctrl+K keyboard shortcut to focus search
- Debounced NL query (300ms) with results dropdown
- Keyboard navigation (arrows, Enter, Escape)
- Ticket results navigate to detail; SOP results search ticket list

### Tests

- 16 unit tests: MockEmbeddingProvider, MockLlmProvider, InMemoryKnowledgeStore, KnowledgeIndexer, FeedbackStore, TriageEngine, TriageStore
- 11 integration tests: knowledge search/status/reindex, suggestions/feedback, triage queue/run/approve

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
