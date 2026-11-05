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
import type { DashboardSummary } from "@regdash/shared";
import { ExcelUpload } from "./components/ExcelUpload";
import { Filters } from "./components/Filters";
import { Gauges } from "./components/Gauges";
import { Logo, RefreshIcon } from "./components/Icons";
import { SourceReadingPanel } from "./components/SourceReadingPanel";
import { SummaryCards } from "./components/SummaryCards";
import { TicketDetail } from "./components/TicketDetail";
import { TicketTable } from "./components/TicketTable";
import { Workload } from "./components/Workload";
import { api, usePolling, type Health } from "./lib/api";

const REFRESH_MS = 60_000;

/** What the pages get from the shell, which owns the polling so it carries on across navigation. */
interface Shared {
  summary: DashboardSummary | null;
  health: Health | null;
  apiError: string | null;
}

const useShared = () => useOutletContext<Shared>();

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? "tab active" : "tab");

/** The header, navigation and banners shown on every page. */
function Shell() {
  const { pathname } = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const summary = usePolling(() => api.summary(), [], REFRESH_MS);
  const health = usePolling(() => api.health(), [], REFRESH_MS);

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
  const shared: Shared = { summary: summary.data, health: h, apiError: summary.error };

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
          </nav>
          <div className="meta">
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
    </>
  );
}

function DashboardPage() {
  const { summary } = useShared();
  const [params] = useSearchParams();

  // Links saved before the pages were split carried the view and filters on "/".
  if (params.get("view") === "workload") return <Navigate to="/workload" replace />;
  if (params.size > 0) return <Navigate to={`/tickets?${params}`} replace />;

  if (!summary) return null;
  return (
    <>
      <div className="section-head">
        <h2>Needs attention</h2>
        <p>Share of open work in each state. Click a gauge to see its tickets.</p>
      </div>
      <Gauges summary={summary} />
      <div className="section-head">
        <h2>Open work</h2>
      </div>
      <SummaryCards summary={summary} />
    </>
  );
}

function TicketsPage() {
  const { summary, health, apiError } = useShared();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { number } = useParams();

  const paramKey = params.toString();
  // Also reloads as soon as the API has new data, so the list never lags the header.
  const list = usePolling(() => api.tickets(new URLSearchParams(paramKey)), [paramKey, summary?.lastRefreshedAt], REFRESH_MS);

  // Filters live in the URL so a filtered view can be shared as a link.
  const update = useCallback(
    (next: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(next)) v === null ? p.delete(k) : p.set(k, v);
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

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
        {!!list.data?.total && (
          <a className="button" href={api.ticketsCsvUrl(params)} download>
            Export CSV
          </a>
        )}
      </div>

      {list.data && <TicketTable items={list.data.items} selected={number} onOpen={open} />}

      {number && <TicketDetail number={number} servicenowUrl={health?.servicenowUrl ?? null} onClose={close} />}
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
