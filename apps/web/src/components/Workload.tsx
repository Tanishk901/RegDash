import { formatEffort, PRIORITIES, type OwnerWorkload } from "@regdash/shared";

/** Open tickets per engineer, so a lead can see who's overloaded. Click a row to see that person's tickets. */
export function Workload({ rows, onPick }: { rows: OwnerWorkload[]; onPick: (owner: string) => void }) {
  if (!rows.length) return <p className="empty">No open tickets.</p>;
  const max = Math.max(...rows.map((r) => r.count));

  return (
    <div className="table-wrap">
      <table className="tickets workload">
        <thead>
          <tr>
            <th>Owner</th>
            <th className="num">Open</th>
            <th className="bar-col" aria-hidden />
            {PRIORITIES.map((p) => (
              <th key={p} className="num">{p}</th>
            ))}
            <th className="num">Breached</th>
            <th className="num">At risk</th>
            <th className="num">On hold</th>
            <th className="num">Stale</th>
            <th className="num" title="Sum of time per task × items, where recorded">Est. effort</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const unassigned = w.owner === "Unassigned";
            const open = () => onPick(unassigned ? "__unassigned" : w.owner);
            return (
              <tr
                key={w.owner}
                onClick={open}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
                tabIndex={0}
                aria-label={`Show ${w.owner}'s tickets`}
              >
                <td className={unassigned ? "muted" : undefined}>{w.owner}</td>
                <td className="num strong">{w.count}</td>
                <td className="bar-col">
                  <span className="bar" style={{ width: `${(w.count / max) * 100}%` }} />
                </td>
                {PRIORITIES.map((p) => (
                  <td key={p} className={`num ${w.byPriority[p] ? "" : "muted"}`}>{w.byPriority[p]}</td>
                ))}
                <td className={`num ${w.breached ? "danger" : "muted"}`}>{w.breached}</td>
                <td className={`num ${w.atRisk ? "warn" : "muted"}`}>{w.atRisk}</td>
                <td className={`num ${w.onHold ? "" : "muted"}`}>{w.onHold}</td>
                <td className={`num ${w.stale ? "warn" : "muted"}`}>{w.stale}</td>
                <td className="num">{w.estimatedHours ? formatEffort(w.estimatedHours) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
