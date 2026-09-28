import { useCallback, useState } from "react";
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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

  const forceRefresh = async () => {
    setRefreshing(true);
    await api.refresh().catch(() => undefined);
    await Promise.all([summary.reload(), list.reload(), health.reload()]);
    setRefreshing(false);
  };

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
          {h && <span className={`source source-${h.source}`}>Source: {h.source}</span>}
          <span className="muted">
            {last ? `Data as of ${new Date(last).toLocaleTimeString()}` : "No data yet"}
          </span>
          <button onClick={forceRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

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
