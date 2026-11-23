import type { GroupByField, TicketView } from "@regdash/shared";
import { DEFAULT_COLUMN_KEYS, resolveColumns } from "../lib/columns";

export function TicketTable({
  items,
  columns,
  groupBy,
  selected,
  onOpen,
  selectable,
  selectedNumbers,
  onSelectionChange,
}: {
  items: TicketView[];
  columns?: string[];
  groupBy?: GroupByField | null;
  selected?: string;
  onOpen: (number: string) => void;
  selectable?: boolean;
  selectedNumbers?: Set<string>;
  onSelectionChange?: (numbers: Set<string>) => void;
}) {
  const cols = resolveColumns(columns ?? DEFAULT_COLUMN_KEYS);

  if (!items.length) {
    return <p className="empty">No tickets match these filters.</p>;
  }

  const groups = groupBy ? groupItems(items, groupBy) : null;

  const toggleOne = (num: string) => {
    if (!onSelectionChange || !selectedNumbers) return;
    const next = new Set(selectedNumbers);
    if (next.has(num)) next.delete(num); else next.add(num);
    onSelectionChange(next);
  };

  const allChecked = items.length > 0 && items.every((t) => selectedNumbers?.has(t.number));

  const toggleAll = () => {
    if (!onSelectionChange || !selectedNumbers) return;
    if (allChecked) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map((t) => t.number)));
    }
  };

  const renderRow = (t: TicketView) => (
    <tr
      key={t.number}
      className={t.number === selected ? "selected" : undefined}
      onClick={() => onOpen(t.number)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(t.number)}
      tabIndex={0}
      aria-label={`Open ${t.number}`}
    >
      {selectable && (
        <td className="col-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedNumbers?.has(t.number) ?? false}
            onChange={() => toggleOne(t.number)}
            aria-label={`Select ${t.number}`}
          />
        </td>
      )}
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
            {selectable && (
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all tickets"
                />
              </th>
            )}
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
                  <th colSpan={cols.length + (selectable ? 1 : 0)}>
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
