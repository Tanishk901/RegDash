import { useCallback, useEffect, useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { DashboardSummary, GroupByField } from "@regdash/shared";
import { GROUP_BY_FIELDS } from "@regdash/shared";
import { ExcelUpload } from "./components/ExcelUpload";
import { ExportMenu } from "./components/ExportMenu";
import { Filters } from "./components/Filters";
import { Gauges } from "./components/Gauges";
import { Logo, RefreshIcon } from "./components/Icons";
import { SourceReadingPanel } from "./components/SourceReadingPanel";
import { SourceStatus } from "./components/SourceStatus";
import { SummaryCards } from "./components/SummaryCards";
import { TicketDetail } from "./components/TicketDetail";
import { TicketTable } from "./components/TicketTable";
import { ViewsPage } from "./components/ViewsPage";
import { CustomViewPage } from "./components/CustomViewPage";
import { Workload } from "./components/Workload";
import { TriageQueuePage } from "./components/TriageQueuePage";
import { TemplatesPage } from "./components/TemplatesPage";
import { GlobalSearch } from "./components/GlobalSearch";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { BulkEmailBar } from "./components/BulkEmailBar";
import { IngestionPage } from "./components/IngestionPage";
import { api, usePolling, type Health } from "./lib/api";

const DEFAULT_REFRESH_MS = 60_000;

/** What the pages get from the shell, which owns the polling so it carries on across navigation. */
interface Shared {
  summary: DashboardSummary | null;
  health: Health | null;
  apiError: string | null;
  reloadAll: () => Promise<void>;
  refreshMs: number;
}

const useShared = () => useOutletContext<Shared>();

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? "tab active" : "tab");

/** The header, navigation and banners shown on every page. */
function Shell() {
  const { pathname } = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const health = usePolling(() => api.health(), [], DEFAULT_REFRESH_MS);
  const refreshMs = (health.data?.refreshIntervalSeconds ?? 60) * 1000;
  const summary = usePolling(() => api.summary(), [], refreshMs);
  const pinnedViews = usePolling(() => api.views({ pinned: true }), [], refreshMs);

  // Start each page at the top. Opening a ticket stays in the same section, so the list keeps its place.
  const section = pathname.split("/")[1];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);

  const reloadAll = () => Promise.all([summary.reload(), health.reload()]);

  const forceRefresh = async () => {
    setRefreshing(true);
    await api.refresh().catch(() => undefined);
    await reloadAll();
    setRefreshing(false);
  };

  /** Runs an upload change, reloads the dashboard and reports the outcome in the notice banner. */
  const changeUpload = async (run: () => Promise<string>) => {
    setUploading(true);
    setNotice(null);
    try {
      const text = await run();
      await reloadAll();
      setNotice({ kind: "ok", text });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  };

  const uploadFile = (file: File) =>
    changeUpload(async () => {
      const r = await api.upload(file);
      const rejected = r.rejected ? ` ${r.rejected} row(s) couldn't be read, see the warning below.` : "";
      return `Loaded ${r.tickets} ticket${r.tickets === 1 ? "" : "s"} from ${r.fileName}.${rejected}`;
    });

  const removeUpload = () =>
    changeUpload(async () => {
      const r = await api.removeUpload();
      return `Upload removed. Back to the ${r.source} source.`;
    });

  const h = health.data;
  const last = summary.data?.lastRefreshedAt;
  const shared: Shared = { summary: summary.data, health: h, apiError: summary.error, reloadAll: async () => { await reloadAll(); }, refreshMs };

  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <div className="brand">
            <Logo />
            <div>
              <h1>RegDash</h1>
              <p className="sub">RegCreate operations</p>
            </div>
          </div>
          <nav className="tabs" aria-label="Pages">
            <NavLink className={tabClass} to="/" end>Dashboard</NavLink>
            <NavLink className={tabClass} to="/tickets">Tickets</NavLink>
            <NavLink className={tabClass} to="/workload">Team workload</NavLink>
            <NavLink className={tabClass} to="/views">Views</NavLink>
            <NavLink className={tabClass} to="/triage">Triage</NavLink>
            <NavLink className={tabClass} to="/templates">Email</NavLink>
            <NavLink className={tabClass} to="/ingestion">Ingestion</NavLink>
            {pinnedViews.data && pinnedViews.data.length > 0 && (
              <>
                <span className="tab-divider" />
                {pinnedViews.data.map((v) => (
                  <NavLink key={v.id} className={tabClass} to={`/views/${v.id}`}>{v.name}</NavLink>
                ))}
              </>
            )}
          </nav>
          <GlobalSearch />
          <div className="meta">
            {h && <SourceStatus health={h} />}
            {h && !h.upload && <span className={`source source-${h.source}`}>Source: {h.source}</span>}
            {h?.upload && (
              <span className="source source-upload" title={h.upload.fileName}>Source: {h.upload.fileName}</span>
            )}
            <span className="muted">
              {/* An uploaded file doesn't change, so re-reading it doesn't make the data any newer. */}
              {h?.upload
                ? `Uploaded ${new Date(h.upload.uploadedAt).toLocaleString()}`
                : last
                  ? `Data as of ${new Date(last).toLocaleTimeString()}`
                  : "No data yet"}
            </span>
            {h?.upload && (
              <button className="link" onClick={removeUpload} disabled={uploading}>
                Remove upload
              </button>
            )}
            <button onClick={forceRefresh} disabled={refreshing}>
              <RefreshIcon />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <ExcelUpload busy={uploading} onPick={uploadFile} />
          </div>
        </div>
      </header>

      <main className="app">
      {notice && (
        <div className={`banner banner-notice ${notice.kind === "ok" ? "banner-ok" : "banner-error"}`} role={notice.kind === "ok" ? "status" : "alert"}>
          <span>{notice.text}</span>
          <button className="link" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {h?.lastError && (
        <div className="banner banner-error" role="alert">
          Last refresh from <b>{h.source}</b> failed: {h.lastError}. Showing the last good data.
        </div>
      )}
      {h && h.rejectedRows.length > 0 && (
        <details className="banner banner-warn">
          <summary>{h.rejectedRows.length} row(s) from the source couldn't be read and are not shown</summary>
          <ul>
            {h.rejectedRows.slice(0, 20).map((r) => (
              <li key={r.row}>{r.row}: {r.reason}</li>
            ))}
          </ul>
        </details>
      )}
      {h?.reading && <SourceReadingPanel reading={h.reading} />}
      {summary.error && !h?.lastError && (
        <div className="banner banner-error" role="alert">
          Can't reach the RegDash API ({summary.error}). Is <code>pnpm dev:api</code> running?
        </div>
      )}

      <Outlet context={shared} />
      </main>
      <ShortcutHelp />
    </>
  );
}

function DashboardPage() {
  const { summary, health, refreshMs } = useShared();
  const feedbackStats = usePolling(() => api.feedbackStats(), [], refreshMs);
  const ingestStats = usePolling(() => api.ingestionStats(), [], refreshMs);
  const [params] = useSearchParams();

  // Links saved before the pages were split carried the view and filters on "/".
  if (params.get("view") === "workload") return <Navigate to="/workload" replace />;
  if (params.size > 0) return <Navigate to={`/tickets?${params}`} replace />;

  if (!summary)
    return (
      <>
        <div className="section-head">
          <h2>Needs attention</h2>
          <p>Loading gauges…</p>
        </div>
        <div className="skeleton" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      </>
    );

  return (
    <>
      <div className="section-head">
        <h2>Needs attention</h2>
        <p>Share of open work in each state. Click a gauge to see its tickets.</p>
      </div>
      <Gauges summary={summary} />
      <div className="section-head">
        <h2>Open work</h2>
        <div className="export-buttons">
          <a className="button" href={api.summaryCsvUrl()} download>Summary CSV</a>
          <a className="button" href={api.summaryXlsxUrl()} download>Summary Excel</a>
        </div>
      </div>
      <SummaryCards summary={summary} />

      {feedbackStats.data && feedbackStats.data.total > 0 && (
        <>
          <div className="section-head">
            <h2>Suggestion feedback</h2>
          </div>
          <div className="cards" style={{ maxWidth: 480 }}>
            <div className="card">
              <span className="card-value">{feedbackStats.data.byAction.accept}</span>
              <span className="card-label">Accepted</span>
            </div>
            <div className="card">
              <span className="card-value">{feedbackStats.data.byAction.dismiss}</span>
              <span className="card-label">Dismissed</span>
            </div>
            <div className="card">
              <span className="card-value">{feedbackStats.data.byAction.flag}</span>
              <span className="card-label">Flagged</span>
            </div>
          </div>
        </>
      )}

      {health?.copilot && (
        <>
          <div className="section-head">
            <h2>AI Copilot</h2>
          </div>
          <div className="cards" style={{ maxWidth: 480 }}>
            <div className="card">
              <span className="card-label">Copilot</span>
              <span className="card-value" style={{ fontSize: 18, color: health.copilot.enabled ? "var(--ok)" : "var(--muted)" }}>
                {health.copilot.enabled ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="card">
              <span className="card-label">Auto-triage</span>
              <span className="card-value" style={{ fontSize: 18, color: health.copilot.triage ? "var(--ok)" : "var(--muted)" }}>
                {health.copilot.triage ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </>
      )}

      {ingestStats.data && ingestStats.data.total > 0 && (
        <>
          <div className="section-head">
            <h2>Mailbox ingestion</h2>
          </div>
          <div className="cards" style={{ maxWidth: 480 }}>
            <div className="card">
              <span className="card-value" style={{ color: ingestStats.data.pending > 0 ? "var(--at-risk)" : "var(--muted)" }}>
                {ingestStats.data.pending}
              </span>
              <span className="card-label">Pending review</span>
            </div>
            <div className="card">
              <span className="card-value">{ingestStats.data.approved}</span>
              <span className="card-label">Approved</span>
            </div>
            <div className="card">
              <span className="card-value">{ingestStats.data.rejected}</span>
              <span className="card-label">Rejected</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TicketsPage() {
  const { summary, health, apiError, reloadAll, refreshMs } = useShared();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { number } = useParams();
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());

  const paramKey = params.toString();
  // Also reloads as soon as the API has new data, so the list never lags the header.
  const list = usePolling(() => api.tickets(new URLSearchParams(paramKey)), [paramKey, summary?.lastRefreshedAt], refreshMs);

  // Filters live in the URL so a filtered view can be shared as a link.
  const update = useCallback(
    (next: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(next)) v === null ? p.delete(k) : p.set(k, v);
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  const columnKeys = params.get("columns")?.split(",").filter(Boolean);
  const groupBy = (params.get("groupBy") as GroupByField | null) ?? undefined;
  const validGroupBy = groupBy && GROUP_BY_FIELDS.includes(groupBy) ? groupBy : undefined;

  const open = (n: string) => navigate({ pathname: `/tickets/${n}`, search: location.search });
  const close = useCallback(() => navigate({ pathname: "/tickets", search: location.search }), [navigate, location.search]);

  return (
    <>
      <Filters params={params} owners={list.data?.owners ?? []} onChange={update} />

      {list.error && !apiError && (
        <div className="banner banner-error" role="alert">Couldn't load tickets: {list.error}</div>
      )}

      <div className="count muted">
        <span>
          {list.data ? `${list.data.total} ticket${list.data.total === 1 ? "" : "s"}` : list.loading ? "Loading…" : ""}
        </span>
        {!!list.data?.total && <ExportMenu params={params} />}
      </div>

      <BulkEmailBar selectedNumbers={selectedNumbers} onDone={() => setSelectedNumbers(new Set())} />

      {list.data && (
        <TicketTable
          items={list.data.items}
          columns={columnKeys ?? undefined}
          groupBy={validGroupBy}
          selected={number}
          onOpen={open}
          selectable
          selectedNumbers={selectedNumbers}
          onSelectionChange={setSelectedNumbers}
        />
      )}

      {number && (
        <TicketDetail
          number={number}
          servicenowUrl={health?.servicenowUrl ?? null}
          onClose={close}
          onMutate={() => { void list.reload(); void reloadAll(); }}
        />
      )}
    </>
  );
}

function WorkloadPage() {
  const { summary } = useShared();
  const navigate = useNavigate();

  if (!summary) return null;
  return (
    <Workload
      rows={summary.byOwner}
      onPick={(owner) => navigate(`/tickets?${new URLSearchParams({ assignedTo: owner })}`)}
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets/:number?" element={<TicketsPage />} />
        <Route path="workload" element={<WorkloadPage />} />
        <Route path="views" element={<ViewsPage />} />
        <Route path="views/:id" element={<CustomViewPage />} />
        <Route path="triage" element={<TriageQueuePage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="ingestion" element={<IngestionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
