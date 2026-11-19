import { useEffect, useRef, useState } from "react";
import { APPLICATION_CODES, ENVIRONMENTS, PRIORITIES, STATUSES } from "@regdash/shared";
import { statusLabel } from "./Badges";
import { ALL_DISPLAY_COLUMNS, DEFAULT_COLUMN_KEYS } from "../lib/columns";

export function Filters({
  params,
  owners,
  onChange,
}: {
  params: URLSearchParams;
  owners: string[];
  onChange: (next: Record<string, string | null>) => void;
}) {
  const val = (k: string) => params.get(k) ?? "";
  const active = [...params.keys()].some((k) => k !== "sort" && k !== "columns" && k !== "groupBy");
  const set = (k: string) => (val(k) ? "is-set" : undefined);

  return (
    <div className="filters" role="search">
      <input
        type="search"
        className={set("q")}
        placeholder="Search number, summary, owner, next action…"
        value={val("q")}
        onChange={(e) => onChange({ q: e.target.value || null })}
        aria-label="Search"
      />
      <select className={set("type")} value={val("type")} onChange={(e) => onChange({ type: e.target.value || null })} aria-label="Type">
        <option value="">All types</option>
        <option value="INCIDENT">Incidents</option>
        <option value="SR">Service requests</option>
      </select>
      <select className={set("status")} value={val("status")} onChange={(e) => onChange({ status: e.target.value || null })} aria-label="Status">
        <option value="">Open (any status)</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{statusLabel(s)}</option>
        ))}
      </select>
      <select className={set("priority")} value={val("priority")} onChange={(e) => onChange({ priority: e.target.value || null })} aria-label="Priority">
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
        <option value="P1,P2">P1 + P2</option>
      </select>
      <select className={set("assignedTo")} value={val("assignedTo")} onChange={(e) => onChange({ assignedTo: e.target.value || null })} aria-label="Owner">
        <option value="">All owners</option>
        <option value="__unassigned">Unassigned</option>
        {owners.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <select className={set("application")} value={val("application")} onChange={(e) => onChange({ application: e.target.value || null })} aria-label="Application">
        <option value="">All applications</option>
        {APPLICATION_CODES.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <select className={set("environment")} value={val("environment")} onChange={(e) => onChange({ environment: e.target.value || null })} aria-label="Environment">
        <option value="">All environments</option>
        {ENVIRONMENTS.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>
      <select className={set("sla")} value={val("sla")} onChange={(e) => onChange({ sla: e.target.value || null })} aria-label="SLA">
        <option value="">Any SLA</option>
        <option value="BREACHED">SLA breached</option>
        <option value="AT_RISK">SLA at risk</option>
        <option value="OK">SLA OK</option>
        <option value="PAUSED">SLA paused</option>
      </select>
      <select value={val("sort") || "sla"} onChange={(e) => onChange({ sort: e.target.value === "sla" ? null : e.target.value })} aria-label="Sort">
        <option value="sla">Sort: needs attention</option>
        <option value="priority">Sort: priority</option>
        <option value="age">Sort: oldest first</option>
        <option value="updated">Sort: least recently updated</option>
      </select>
      <label className={`check ${set("stale") ?? ""}`}>
        <input
          type="checkbox"
          checked={val("stale") === "true"}
          onChange={(e) => onChange({ stale: e.target.checked ? "true" : null })}
        />
        Stale only
      </label>
      <label className={`check ${set("includeClosed") ?? ""}`}>
        <input
          type="checkbox"
          checked={val("includeClosed") === "true"}
          onChange={(e) => onChange({ includeClosed: e.target.checked ? "true" : null })}
        />
        Include closed
      </label>
      <ColumnPicker params={params} onChange={onChange} />
      {active && (
        <button className="link" onClick={() => onChange({ q: null, type: null, status: null, priority: null, assignedTo: null, application: null, environment: null, sla: null, stale: null, includeClosed: null })}>
          Clear filters
        </button>
      )}
    </div>
  );
}

function ColumnPicker({
  params,
  onChange,
}: {
  params: URLSearchParams;
  onChange: (next: Record<string, string | null>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = params.get("columns")?.split(",").filter(Boolean) ?? DEFAULT_COLUMN_KEYS;
  const selected = new Set(current);
  const isCustom = params.has("columns");

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
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    if (next.size === 0) return;
    onChange({ columns: [...next].join(",") });
  };

  const reset = () => {
    onChange({ columns: null });
    setOpen(false);
  };

  return (
    <div className="column-picker-wrap" ref={ref}>
      <button className={`link${isCustom ? " is-set" : ""}`} onClick={() => setOpen(!open)}>
        Columns{isCustom ? ` (${selected.size})` : ""} ▾
      </button>
      {open && (
        <div className="export-picker">
          <div className="picker-head">
            <span className="strong small">Show columns</span>
            {isCustom && (
              <button className="link small" onClick={reset}>Reset</button>
            )}
          </div>
          <div className="picker-list">
            {ALL_DISPLAY_COLUMNS.map((c) => (
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
            <span className="muted small">{selected.size} of {ALL_DISPLAY_COLUMNS.length} columns</span>
          </div>
        </div>
      )}
    </div>
  );
}
