import { useState } from "react";
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

function TriageRow({ item, onAction }: { item: TriageItem; onAction: () => void }) {
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
  const [running, setRunning] = useState(false);

  const runTriage = async () => {
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
  };

  return (
    <div className="triage-page">
      <div className="section-head">
        <h2>Auto-Triage Queue</h2>
        <button onClick={runTriage} disabled={running}>
          {running ? "Running…" : "Run triage on new tickets"}
        </button>
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

      {queue.data && queue.data.length > 0 && (
        <table className="triage-table" role="table" aria-label="Triage queue">
          <thead>
            <tr>
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
              <TriageRow key={item.id} item={item} onAction={refresh} />
            ))}
          </tbody>
        </table>
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
