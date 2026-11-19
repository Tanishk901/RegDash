import type { GroupByField, TicketView } from "@regdash/shared";
import { DEFAULT_COLUMN_KEYS, resolveColumns } from "../lib/columns";

export function TicketTable({
  items,
  columns,
  groupBy,
  selected,
  onOpen,
}: {
  items: TicketView[];
  columns?: string[];
  groupBy?: GroupByField | null;
  selected?: string;
  onOpen: (number: string) => void;
}) {
  const cols = resolveColumns(columns ?? DEFAULT_COLUMN_KEYS);

  if (!items.length) {
    return <p className="empty">No tickets match these filters.</p>;
  }

  const groups = groupBy ? groupItems(items, groupBy) : null;

  const renderRow = (t: TicketView) => (
    <tr
      key={t.number}
      className={t.number === selected ? "selected" : undefined}
      onClick={() => onOpen(t.number)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(t.number)}
      tabIndex={0}
      aria-label={`Open ${t.number}`}
    >
      {cols.map((c) => (
        <td key={c.key} className={c.className}>
          {c.render(t)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="table-wrap">
      <table className="tickets">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        {groups
          ? [...groups.entries()].map(([label, group]) => (
              <tbody key={label}>
                <tr className="group-header">
                  <th colSpan={cols.length}>
                    {label} <span className="muted">({group.length})</span>
                  </th>
                </tr>
                {group.map(renderRow)}
              </tbody>
            ))
          : <tbody>{items.map(renderRow)}</tbody>}
      </table>
    </div>
  );
}

function groupItems(items: TicketView[], field: GroupByField): Map<string, TicketView[]> {
  const map = new Map<string, TicketView[]>();
  for (const t of items) {
    const raw = t[field];
    const key = raw == null ? "—" : String(raw);
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(t);
  }
  return map;
}
