import { useCallback, useState } from "react";
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExcelUpload } from "./components/ExcelUpload";
import { Filters } from "./components/Filters";
import { SummaryCards } from "./components/SummaryCards";
import { TicketDetail } from "./components/TicketDetail";
import { TicketTable } from "./components/TicketTable";
import { Workload } from "./components/Workload";
import { api, usePolling } from "./lib/api";

const REFRESH_MS = 60_000;

function Dashboard() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { number } = useParams();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const paramKey = params.toString();
  const summary = usePolling(() => api.summary(), [], REFRESH_MS);
  const list = usePolling(() => api.tickets(new URLSearchParams(paramKey)), [paramKey], REFRESH_MS);
  const health = usePolling(() => api.health(), [], REFRESH_MS);

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
  const close = useCallback(() => navigate({ pathname: "/", search: location.search }), [navigate, location.search]);

  const reloadAll = () => Promise.all([summary.reload(), list.reload(), health.reload()]);

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
  const view = params.get("view") === "workload" ? "workload" : "tickets";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>▦</span>
          <div>
            <h1>RegDash</h1>
            <p className="sub">RegCreate operations — open incidents &amp; service requests</p>
          </div>
        </div>
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
          <ExcelUpload busy={uploading} onPick={uploadFile} />
          <button onClick={forceRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

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
      {(summary.error || list.error) && !h?.lastError && (
        <div className="banner banner-error" role="alert">
          Can't reach the RegDash API ({summary.error ?? list.error}). Is <code>pnpm dev:api</code> running?
        </div>
      )}

      {summary.data && (
        <SummaryCards
          summary={summary.data}
          params={params}
          onPick={(f) =>
            update({ view: null, type: null, status: null, priority: null, sla: null, assignedTo: null, stale: null, sort: null, ...f })
          }
        />
      )}

      <nav className="tabs" aria-label="View">
        <button className={view === "tickets" ? "tab active" : "tab"} aria-pressed={view === "tickets"} onClick={() => update({ view: null })}>
          Tickets
        </button>
        <button className={view === "workload" ? "tab active" : "tab"} aria-pressed={view === "workload"} onClick={() => update({ view: "workload" })}>
          Team workload
        </button>
      </nav>

      {view === "workload" ? (
        summary.data && (
          <Workload rows={summary.data.byOwner} onPick={(owner) => update({ view: null, assignedTo: owner })} />
        )
      ) : (
        <>
          <Filters params={params} owners={list.data?.owners ?? []} onChange={update} />

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
        </>
      )}

      {number && <TicketDetail number={number} servicenowUrl={h?.servicenowUrl ?? null} onClose={close} />}
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/tickets/:number" element={<Dashboard />} />
    </Routes>
  );
}
