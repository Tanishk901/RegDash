# RegDash

**RegCreate Operations Dashboard.** A live view of the support team's open incidents and service requests: what's open, what's breaching, who owns it, what it's waiting on, and the next action.

Phase 1 (this repo) is read-only visibility. Requirements and design: **[docs/PHASE-1.md](docs/PHASE-1.md)**.

![RegDash dashboard](docs/screenshot.png)

```
regdash/
├── apps/
│   ├── api/          Node + Express + TypeScript: sources, cache, REST API
│   └── web/          React + Vite + TypeScript: the dashboard
├── packages/
│   └── shared/       Ticket types + SLA logic shared by both apps
├── data/
│   └── sample-tickets.xlsx   fake tracker for testing the Excel source
└── docs/PHASE-1.md
```

## Quick start

Needs **Node 22.9+** (the API loads `.env` with `--env-file-if-exists`) and **pnpm** (`npm i -g pnpm` or `corepack enable`).

```bash
pnpm install
pnpm dev          # API on :4000, dashboard on http://localhost:5173
```

That runs on **mock data** with zero setup. No real company data is involved.

## Pages

| URL | Shows |
|---|---|
| `/` | Dashboard: the gauges and totals. Click one to see its tickets |
| `/tickets` | Ticket table with filters. Filters stay in the URL, so a view can be shared |
| `/tickets/INC0012345` | The same table with that ticket's detail panel open |
| `/workload` | Open tickets per engineer |

## Switching data sources

```bash
cp .env.example apps/api/.env
```

Then set `DATA_SOURCE` in `apps/api/.env`:

| Value | Reads from | Use for |
|---|---|---|
| `mock` (default) | generated fake tickets | development on any machine |
| `excel` | `EXCEL_PATH` (.xlsx) | the team tracker, a local or OneDrive-synced copy of the SharePoint file |
| `servicenow` | ServiceNow Table API | live data (needs a read-only service account) |

### Uploading a tracker from the dashboard

Click **Upload Excel** in the top bar and pick an `.xlsx` file (25 MB max). No `.env` change or restart is needed. The file becomes the live source, replacing whichever one is configured, until you click **Remove upload**.

- A copy is kept at `EXCEL_UPLOAD_PATH` (default `data/uploaded-tracker.xlsx`, git-ignored) so it survives an API restart. The file at `EXCEL_PATH` is never changed.
- A file that can't be read, or has no usable tickets, is refused with the reason, and the current data stays.
- The dashboard shows what was uploaded and when. It doesn't update until someone uploads a newer file.
- The upload applies to everyone viewing this API, and the API has no login, so keep it on the work machine or internal network.

To try the Excel source with fake data, run `pnpm sample:excel`, which regenerates `data/sample-tickets.xlsx`, then set `DATA_SOURCE=excel`.

For the **real tracker**, copy the file and check its headers against the alias table in `docs/PHASE-1.md` §7. Most common header names already work. Any rows RegDash can't read appear in a yellow banner with the reason.

> ⚠️ Only upload real data, or point `excel` or `servicenow` at it, on your work machine, inside the company network. Never copy real ticket data to a personal device.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API + web with hot reload |
| `pnpm dev:api` / `pnpm dev:web` | one side only |
| `pnpm test` | unit tests (normalization, sources, API, SLA) |
| `pnpm typecheck` | strict TypeScript across all packages |
| `pnpm build` | typecheck + production build of the web app |
| `pnpm sample:excel` | regenerate the sample tracker workbook |
| `pnpm sn:check` | read-only ServiceNow connection check (work machine, needs `SERVICENOW_*` in `.env`) |

## API

`GET /api/health` · `POST /api/refresh` · `GET /api/summary` · `GET /api/tickets?type=&status=&priority=&sla=&stale=&assignedTo=&q=&includeClosed=&sort=&dir=` · `GET /api/tickets.csv?…same filters` · `GET /api/tickets/:number` · `POST /api/upload?fileName=` (raw `.xlsx` body) · `DELETE /api/upload`

## Before showing it to anyone

- Replace the placeholder SLA hours in `packages/shared/src/sla.ts` with the team's real SLA matrix.
- Replace the placeholder gauge limits (`GAUGE_LIMITS` in `packages/shared/src/gauges.ts`) with the limits the team agrees on.
- Agree the `Next:` / `Blocker:` / `Pending:` work-note convention if you're using the ServiceNow source.

## Roadmap

1. **Visibility.** This dashboard ✅
2. **Access automation.** Templated welcome and access emails when a user is provisioned
3. **Mailbox → ServiceNow.** Classify shared-mailbox emails, draft INC/SR, human approves, send acknowledgment
4. **Support copilot.** RAG over SOPs and past tickets to suggest resolutions, with sources
