import { useEffect, useRef, useState } from "react";
import { STATUSES, formatDuration, formatEffort, slaDueAt, type TicketStatus, type TicketView } from "@regdash/shared";
import { api, serviceNowLink, usePolling, type TeamInfo } from "../lib/api";
import { PriorityBadge, SlaBadge, StatusBadge, TypeTag, statusLabel } from "./Badges";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const CURRENT_USER = "You";

function CommentForm({ number, onDone }: { number: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.addComment(number, note.trim(), CURRENT_USER);
      setNote("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="comment-form">
      <textarea
        ref={ref}
        className="comment-input"
        placeholder="Add a comment…"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
        disabled={saving}
      />
      {error && <p className="error small">{error}</p>}
      <div className="comment-actions">
        <span className="muted small">Ctrl+Enter to send</span>
        <button onClick={submit} disabled={saving || !note.trim()}>
          {saving ? "Sending…" : "Add comment"}
        </button>
      </div>
    </div>
  );
}

function AssignDropdown({
  number,
  current,
  team,
  onDone,
}: {
  number: string;
  current: string | null;
  team: TeamInfo;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const change = async (val: string) => {
    const assignedTo = val === "__unassigned" ? null : val;
    if (assignedTo === current) return;
    setSaving(true);
    try {
      await api.assignTicket(number, assignedTo);
      onDone();
    } catch {
      /* optimistic UI: reload will correct */
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      className="inline-select"
      value={current ?? "__unassigned"}
      onChange={(e) => change(e.target.value)}
      disabled={saving || !team.writable}
      title={team.writable ? "Reassign" : "Source is read-only"}
    >
      <option value="__unassigned">Unassigned</option>
      {team.members.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  );
}

function StatusDropdown({
  number,
  current,
  writable,
  onDone,
}: {
  number: string;
  current: TicketStatus;
  writable: boolean;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const change = async (val: string) => {
    if (val === current) return;
    setSaving(true);
    try {
      await api.updateStatus(number, val, CURRENT_USER);
      onDone();
    } catch {
      /* reload will correct */
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      className="inline-select"
      value={current}
      onChange={(e) => change(e.target.value)}
      disabled={saving || !writable}
      title={writable ? "Change status" : "Source is read-only"}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>{statusLabel(s)}</option>
      ))}
    </select>
  );
}

export function TicketDetail({
  number,
  servicenowUrl,
  onClose,
  onMutate,
}: {
  number: string;
  servicenowUrl: string | null;
  onClose: () => void;
  onMutate?: () => void;
}) {
  const { data: t, error, reload } = usePolling(() => api.ticket(number), [number]);
  const { data: team } = usePolling(() => api.team(), []);
  const snLink = servicenowUrl ? serviceNowLink(servicenowUrl, number) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const afterWrite = () => {
    void reload();
    onMutate?.();
  };

  const writable = team?.writable ?? false;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail" role="dialog" aria-label={`Ticket ${number}`}>
        <header className="detail-head">
          <h2 className="mono">
            {t && <TypeTag t={t.type} />} {number}
          </h2>
          <div className="detail-actions">
            {snLink && (
              <a className="button" href={snLink} target="_blank" rel="noreferrer">
                Open in ServiceNow ↗
              </a>
            )}
            <button className="icon" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        {error && <p className="error">Couldn't load ticket: {error}</p>}
        {!t && !error && <p className="muted">Loading…</p>}

        {t && (
          <div className="detail-body">
            <h3>{t.shortDescription}</h3>
            <div className="badges">
              <PriorityBadge p={t.priority} />
              {writable ? (
                <StatusDropdown number={number} current={t.status} writable={writable} onDone={afterWrite} />
              ) : (
                <StatusBadge s={t.status} />
              )}
              <SlaBadge s={t.sla} />
              {t.stale && <span className="badge sla-AT_RISK">No update 48h+</span>}
            </div>

            <section className="callout">
              <div>
                <span className="k">Next action</span>
                <span className="v">{t.nextAction ?? "Not set — add one in the tracker / work notes"}</span>
              </div>
              {t.status === "ON_HOLD" && (
                <>
                  <div>
                    <span className="k">Pending on</span>
                    <span className="v">{t.pendingOwner ?? "—"}</span>
                  </div>
                  <div>
                    <span className="k">Blocker</span>
                    <span className="v">{t.blocker ?? "—"}</span>
                  </div>
                </>
              )}
            </section>

            <dl className="facts">
              <dt>Owner</dt>
              <dd>
                {team && writable ? (
                  <AssignDropdown number={number} current={t.assignedTo} team={team} onDone={afterWrite} />
                ) : (
                  t.assignedTo ?? "Unassigned"
                )}
              </dd>
              <dt>Group</dt><dd>{t.assignmentGroup ?? "—"}</dd>
              <dt>Requested by</dt><dd>{t.requestedBy ?? "—"}</dd>
              <dt>Created</dt><dd>{fmt(t.createdAt)} <span className="muted">({formatDuration(t.ageHours)} ago)</span></dd>
              <dt>Last updated</dt><dd>{fmt(t.updatedAt)} <span className="muted">({formatDuration(t.hoursSinceUpdate)} ago)</span></dd>
              {t.pendingSince && (
                <>
                  <dt>Pending since</dt>
                  <dd>
                    {fmt(t.pendingSince)}
                    {t.pendingHours != null && <span className="muted"> ({formatDuration(t.pendingHours)})</span>}
                  </dd>
                </>
              )}
              {t.taskHours != null && (<><dt>Time per task</dt><dd>{formatEffort(t.taskHours)}</dd></>)}
              {t.itemCount != null && (<><dt>Items</dt><dd>{t.itemCount}</dd></>)}
              {t.estimatedHours != null && (
                <>
                  <dt>Estimated total</dt>
                  <dd>
                    {formatEffort(t.estimatedHours)}{" "}
                    <span className="muted">({formatEffort(t.taskHours!)} × {t.itemCount})</span>
                  </dd>
                </>
              )}
              <dt>SLA due</dt>
              <dd>
                {fmt(slaDueAt(t).toISOString())}
                {!t.slaDueAt && <span className="muted"> (default for {t.priority})</span>}
              </dd>
              <dt>Source</dt><dd>{t.source}</dd>
            </dl>

            {t.description && (
              <section>
                <h4>Description</h4>
                <p className="pre">{t.description}</p>
              </section>
            )}

            <section>
              <h4>Activity</h4>
              {writable && <CommentForm number={number} onDone={afterWrite} />}
              {t.updates.length ? (
                <ol className="timeline">
                  {[...t.updates].reverse().map((u, i) => (
                    <li key={i}>
                      <div className="when">{fmt(u.at)} · {u.by}</div>
                      <div className="pre">{u.note}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No updates recorded.</p>
              )}
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
