import { useEffect } from "react";
import { formatDuration, formatEffort, slaDueAt } from "@regdash/shared";
import { api, serviceNowLink, usePolling } from "../lib/api";
import { PriorityBadge, SlaBadge, StatusBadge, TypeTag } from "./Badges";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export function TicketDetail({
  number,
  servicenowUrl,
  onClose,
}: {
  number: string;
  servicenowUrl: string | null;
  onClose: () => void;
}) {
  const { data: t, error } = usePolling(() => api.ticket(number), [number]);
  const snLink = servicenowUrl ? serviceNowLink(servicenowUrl, number) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
              <StatusBadge s={t.status} />
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
              <dt>Owner</dt><dd>{t.assignedTo ?? "Unassigned"}</dd>
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
