import { useState } from "react";
import { api, usePolling, type IngestDraft } from "../lib/api";

function DraftDetail({
  draft,
  onApprove,
  onReject,
  onClose,
}: {
  draft: IngestDraft;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try { await onApprove(draft.id); onClose(); } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try { await onReject(draft.id, reason.trim()); onClose(); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="shortcut-dialog" role="dialog" aria-label="Review draft" style={{ minWidth: 500, maxHeight: "80vh", overflow: "auto" }}>
        <h3>Review draft</h3>

        <div style={{ marginBottom: 16, padding: 12, background: "var(--surface)", borderRadius: "var(--radius-xs)", border: "1px solid var(--border)" }}>
          <div className="muted small" style={{ marginBottom: 4 }}>Original email</div>
          <div><strong>From:</strong> {draft.emailFrom}</div>
          <div><strong>Subject:</strong> {draft.emailSubject}</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 8, maxHeight: 150, overflow: "auto" }}>{draft.emailBody}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="muted small" style={{ marginBottom: 4 }}>Classification</div>
          <span className="badge">{draft.classification.replace(/_/g, " ")}</span>
          <span className="muted small" style={{ marginLeft: 8 }}>{draft.classificationReason}</span>
        </div>

        <div style={{ marginBottom: 16, padding: 12, background: "var(--surface)", borderRadius: "var(--radius-xs)", border: "1px solid var(--border)" }}>
          <div className="muted small" style={{ marginBottom: 4 }}>Draft ticket</div>
          <div><strong>Type:</strong> {draft.draftType}</div>
          <div><strong>Priority:</strong> {draft.draftPriority}</div>
          <div><strong>Short description:</strong> {draft.draftShortDescription}</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 8, maxHeight: 150, overflow: "auto" }}>{draft.draftDescription}</div>
        </div>

        {draft.status === "pending" && (
          <>
            <div className="vb-field" style={{ marginBottom: 8 }}>
              <label>Rejection reason (required to reject)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="spam, duplicate, not actionable…"
              />
            </div>

            <div className="vb-actions">
              <button onClick={approve} disabled={busy} style={{ background: "var(--ok)", color: "#fff" }}>
                {busy ? "…" : "Approve & create ticket"}
              </button>
              <button onClick={reject} disabled={busy || !reason.trim()} style={{ background: "var(--breach)", color: "#fff" }}>
                {busy ? "…" : "Reject"}
              </button>
              <button className="link" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {draft.status === "approved" && (
          <div style={{ padding: 8, background: "var(--ok-bg, #e8f5e9)", borderRadius: "var(--radius-xs)" }}>
            Approved by {draft.reviewedBy} — ticket {draft.createdTicketNumber}
          </div>
        )}
        {draft.status === "rejected" && (
          <div style={{ padding: 8, background: "var(--breach-bg, #fce4ec)", borderRadius: "var(--radius-xs)" }}>
            Rejected by {draft.reviewedBy}: {draft.rejectionReason}
          </div>
        )}
      </div>
    </>
  );
}

export function IngestionPage() {
  const { data: stats, reload: reloadStats } = usePolling(() => api.ingestionStats(), [], 0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: queue, reload } = usePolling(() => api.ingestionQueue(statusFilter || undefined), [statusFilter], 0);
  const [selected, setSelected] = useState<IngestDraft | null>(null);
  const [polling, setPolling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const poll = async () => {
    setPolling(true);
    try {
      await api.ingestionPoll();
      await reload();
      await reloadStats();
    } finally {
      setPolling(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await api.ingestionApprove(id, "Current User");
      await reload();
      await reloadStats();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to approve draft");
    }
  };

  const handleReject = async (id: string, reason: string) => {
    setActionError(null);
    try {
      await api.ingestionReject(id, "Current User", reason);
      await reload();
      await reloadStats();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reject draft");
    }
  };

  return (
    <div className="views-page">
      <div className="section-head">
        <h2>Mailbox Ingestion</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={poll} disabled={polling}>
            {polling ? "Checking…" : "Check mailbox"}
          </button>
        </div>
      </div>

      {stats && (
        <div className="cards" style={{ maxWidth: 600, marginBottom: 16 }}>
          <div className="card">
            <span className="card-value">{stats.pending}</span>
            <span className="card-label">Pending</span>
          </div>
          <div className="card">
            <span className="card-value">{stats.approved}</span>
            <span className="card-label">Approved</span>
          </div>
          <div className="card">
            <span className="card-value">{stats.rejected}</span>
            <span className="card-label">Rejected</span>
          </div>
          <div className="card">
            <span className="card-value">{stats.total}</span>
            <span className="card-label">Total</span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <select
          className="inline-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All drafts</option>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {actionError && (
        <div className="banner banner-error" role="alert">{actionError}</div>
      )}

      {queue && queue.length === 0 && (
        <p className="muted">
          No drafts{statusFilter ? ` with status "${statusFilter}"` : ""}. Click "Check mailbox" to poll for new emails.
        </p>
      )}

      {queue && queue.length > 0 && (
        <div className="triage-table-wrap">
          <table className="triage-table" aria-label="Ingestion queue">
            <thead>
              <tr>
                <th>Received</th>
                <th>From</th>
                <th>Subject</th>
                <th>Classification</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d)}
                  style={{ cursor: "pointer" }}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(d)}
                >
                  <td className="muted small">{new Date(d.emailReceivedAt).toLocaleString()}</td>
                  <td>{d.emailFrom}</td>
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.emailSubject}
                  </td>
                  <td><span className="badge">{d.classification.replace(/_/g, " ")}</span></td>
                  <td>{d.draftType}</td>
                  <td>{d.draftPriority}</td>
                  <td>
                    <span className={`badge ${d.status === "approved" ? "badge-ok" : d.status === "rejected" ? "badge-breach" : "badge-at-risk"}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DraftDetail
          draft={selected}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
