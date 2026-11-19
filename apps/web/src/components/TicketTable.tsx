import type { TicketView } from "@regdash/shared";
import { DEFAULT_COLUMN_KEYS, resolveColumns } from "../lib/columns";

export function TicketTable({
  items,
  columns,
  selected,
  onOpen,
}: {
  items: TicketView[];
  columns?: string[];
  selected?: string;
  onOpen: (number: string) => void;
}) {
  const cols = resolveColumns(columns ?? DEFAULT_COLUMN_KEYS);

  if (!items.length) {
    return <p className="empty">No tickets match these filters.</p>;
  }
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
              {cols.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render(t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
