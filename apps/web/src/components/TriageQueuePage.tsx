import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, usePolling, type TriageItem } from "../lib/api";

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="triage-stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function TriageRow({ item, onAction, checked, onToggle }: { item: TriageItem; onAction: () => void; checked: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const [acting, setActing] = useState(false);

  const act = async (action: "approve" | "reject") => {
    setActing(true);
    try {
      if (action === "approve") await api.triageApprove(item.id);
      else await api.triageReject(item.id);
      onAction();
    } catch {
      /* reload will show the right state */
    } finally {
      setActing(false);
    }
  };

  const badge =
    item.status === "approved" ? "triage-approved" :
    item.status === "rejected" ? "triage-rejected" : "triage-pending";

  return (
    <tr>
      <td>
        {item.status === "pending" && (
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${item.ticketNumber}`} />
        )}
      </td>
      <td>
        <button className="link" onClick={() => navigate(`/tickets/${item.ticketNumber}`)}>
          {item.ticketNumber}
        </button>
      </td>
      <td>{item.suggestedPriority}</td>
      <td>{item.suggestedCategory}</td>
      <td>{item.suggestedAssignee ?? "—"}</td>
      <td>{Math.round(item.confidence * 100)}%</td>
      <td>
        <span className={`triage-badge ${badge}`}>
          {item.status}
        </span>
      </td>
      <td>
        {item.status === "pending" ? (
          <div className="triage-actions">
            <button className="approve" onClick={() => act("approve")} disabled={acting}>
              Approve
            </button>
            <button className="reject" onClick={() => act("reject")} disabled={acting}>
              Reject
            </button>
          </div>
        ) : (
          <span className="muted small">
            {item.reviewedBy} · {item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : ""}
          </span>
        )}
      </td>
    </tr>
  );
}

export function TriageQueuePage() {
  const queue = usePolling(() => api.triageQueue(), [], 30_000);
  const stats = usePolling(() => api.triageStats(), [], 30_000);
  const trend = usePolling(() => api.triageTrend(), [], 30_000);
  const [running, setRunning] = useState(false);
  const lastRun = useRef(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);

  const pendingIds = queue.data?.filter((i) => i.status === "pending").map((i) => i.id) ?? [];
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pendingIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: "approve" | "reject") => {
    if (selected.size === 0) return;
    setBulking(true);
    try {
      await api.triageBulk([...selected], action);
      setSelected(new Set());
      await Promise.all([queue.reload(), stats.reload(), trend.reload()]);
    } catch { /* */ } finally {
      setBulking(false);
    }
  };

  const runTriage = async () => {
    if (Date.now() - lastRun.current < 2000) return;
    lastRun.current = Date.now();
    setRunning(true);
    try {
      await api.triageRun();
      await Promise.all([queue.reload(), stats.reload()]);
    } catch {
      /* */
    } finally {
      setRunning(false);
    }
  };

  const refresh = () => {
    void queue.reload();
    void stats.reload();
    void trend.reload();
  };

  return (
    <div className="triage-page">
      <div className="section-head">
        <h2>Auto-Triage Queue</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runTriage} disabled={running}>
            {running ? "Running…" : "Run triage on new tickets"}
          </button>
          <a className="button" href="/api/triage/queue.csv" download>Export CSV</a>
        </div>
      </div>

      {stats.data && (
        <div className="triage-stats">
          <StatCard value={stats.data.total} label="Total" />
          <StatCard value={stats.data.pending} label="Pending" />
          <StatCard value={stats.data.approved} label="Approved" />
          <StatCard value={stats.data.rejected} label="Rejected" />
          <StatCard value={`${Math.round(stats.data.accuracy * 100)}%`} label="Accuracy" />
        </div>
      )}

      {queue.error && <div className="banner banner-error" role="alert">{queue.error}</div>}

      {!queue.data && !queue.error && (
        <div className="skeleton" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton-card" style={{ height: 56 }} />
          ))}
        </div>
      )}

      {queue.data && queue.data.length === 0 && (
        <p className="muted">No triage suggestions yet. Click "Run triage on new tickets" to generate them.</p>
      )}

      {queue.data && queue.data.length > 0 && selected.size > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <span className="muted small">{selected.size} selected</span>
          <button onClick={() => bulkAction("approve")} disabled={bulking}>Approve all</button>
          <button onClick={() => bulkAction("reject")} disabled={bulking}>Reject all</button>
        </div>
      )}

      {queue.data && queue.data.length > 0 && (
        <table className="triage-table" role="table" aria-label="Triage queue">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all pending" />
              </th>
              <th>Ticket</th>
              <th>Priority</th>
              <th>Category</th>
              <th>Assignee</th>
              <th>Confidence</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.data.map((item) => (
              <TriageRow key={item.id} item={item} onAction={refresh} checked={selected.has(item.id)} onToggle={() => toggleOne(item.id)} />
            ))}
          </tbody>
        </table>
      )}

      {trend.data && trend.data.some((d) => d.total > 0) && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Accuracy trend (last 7 days)</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
            {trend.data.map((d) => {
              const max = Math.max(...trend.data!.map((t) => t.total), 1);
              const h = (d.total / max) * 100;
              const pct = d.total > 0 ? Math.round((d.approved / d.total) * 100) : 0;
              return (
                <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      height: `${h}%`,
                      minHeight: 4,
                      background: pct >= 70 ? "var(--ok)" : pct >= 40 ? "var(--warn)" : "var(--danger)",
                      borderRadius: 4,
                      opacity: 0.7,
                    }}
                    title={`${d.date}: ${d.approved} approved, ${d.rejected} rejected (${pct}%)`}
                  />
                  <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{d.date.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {queue.data && queue.data.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="muted">Reasoning details</summary>
          <ul style={{ marginTop: 8 }}>
            {queue.data.map((item) => (
              <li key={item.id} style={{ marginBottom: 6 }}>
                <strong>{item.ticketNumber}:</strong> {item.reasoning}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
