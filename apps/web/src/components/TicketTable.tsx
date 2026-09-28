import { formatDuration, formatEffort, type TicketView } from "@regdash/shared";
import { PriorityBadge, SlaBadge, StatusBadge, TypeTag } from "./Badges";

export function TicketTable({
  items,
  selected,
  onOpen,
}: {
  items: TicketView[];
  selected?: string;
  onOpen: (number: string) => void;
}) {
  if (!items.length) {
    return <p className="empty">No tickets match these filters.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="tickets">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Summary</th>
            <th>Priority</th>
            <th>Status</th>
            <th>SLA</th>
            <th>Owner</th>
            <th>Pending on</th>
            <th className="num" title="How long it has been pending (Pending Since)">Pending for</th>
            <th>Next action</th>
            <th className="num" title="Time one task takes, from the tracker">Time / task</th>
            <th className="num" title="Time per task × number of items">Est. total</th>
            <th className="num">Age</th>
            <th className="num">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.number}
              className={t.number === selected ? "selected" : undefined}
              onClick={() => onOpen(t.number)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(t.number)}
              tabIndex={0}
              aria-label={`Open ${t.number}`}
            >
              <td className="mono">
                <TypeTag t={t.type} /> {t.number}
              </td>
              <td className="summary">{t.shortDescription}</td>
              <td><PriorityBadge p={t.priority} /></td>
              <td><StatusBadge s={t.status} /></td>
              <td><SlaBadge s={t.sla} /></td>
              <td>{t.assignedTo ?? <span className="muted">Unassigned</span>}</td>
              <td>{t.pendingOwner ?? <span className="muted">—</span>}</td>
              <td className="num" title={t.pendingSince ? `Since ${new Date(t.pendingSince).toLocaleString()}` : undefined}>
                {t.pendingHours != null ? formatDuration(t.pendingHours) : <span className="muted">—</span>}
              </td>
              <td className="next">{t.nextAction ?? <span className="muted">Not set</span>}</td>
              <td className="num">{t.taskHours != null ? formatEffort(t.taskHours) : <span className="muted">—</span>}</td>
              <td className="num">
                {t.estimatedHours != null ? (
                  <>
                    {formatEffort(t.estimatedHours)}
                    <div className="muted small">{t.itemCount} items</div>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="num">{formatDuration(t.ageHours)}</td>
              <td className={`num ${t.stale ? "stale" : ""}`} title={t.stale ? "No update in 48h+" : undefined}>
                {formatDuration(t.hoursSinceUpdate)} ago
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
