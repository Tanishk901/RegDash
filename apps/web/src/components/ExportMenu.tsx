import { useEffect, useRef, useState } from "react";
import { api, type ExportColumn } from "../lib/api";

export function ExportMenu({ params }: { params: URLSearchParams }) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<ExportColumn[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || columns) return;
    api.exportColumns().then((cols) => {
      setColumns(cols);
      setSelected(new Set(cols.map((c) => c.key)));
    });
  }, [open, columns]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns?.map((c) => c.key) ?? []));
  const selectNone = () => setSelected(new Set());

  const csvUrl = api.ticketsCsvUrl(params);
  const xlsxUrl = api.ticketsXlsxUrl(params, columns ? [...selected] : undefined);

  return (
    <div className="export-menu" ref={ref}>
      <div className="export-buttons">
        <a className="button" href={csvUrl} download>CSV</a>
        <a className="button" href={xlsxUrl} download>Excel</a>
        <button className="link" onClick={() => setOpen(!open)}>
          Columns ▾
        </button>
      </div>

      {open && columns && (
        <div className="export-picker">
          <div className="picker-head">
            <span className="strong small">Include in export</span>
            <span>
              <button className="link small" onClick={selectAll}>All</button>
              {" · "}
              <button className="link small" onClick={selectNone}>None</button>
            </span>
          </div>
          <div className="picker-list">
            {columns.map((c) => (
              <label key={c.key} className="picker-item">
                <input
                  type="checkbox"
                  checked={selected.has(c.key)}
                  onChange={() => toggle(c.key)}
                />
                {c.header}
              </label>
            ))}
          </div>
          <div className="picker-foot">
            <span className="muted small">{selected.size} of {columns.length} columns</span>
            <a
              className="button"
              href={api.ticketsXlsxUrl(params, [...selected])}
              download
              onClick={() => setOpen(false)}
            >
              Download Excel
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
