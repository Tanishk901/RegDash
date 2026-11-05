import { PRIORITIES, STATUSES } from "@regdash/shared";
import { statusLabel } from "./Badges";

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
  const active = [...params.keys()].some((k) => k !== "sort");
  // Marks a control whose filter is applied, so it's obvious at a glance.
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
      <select className={set("type")} value={val("type")}onChange={(e) => onChange({ type: e.target.value || null })} aria-label="Type">
        <option value="">All types</option>
        <option value="INCIDENT">Incidents</option>
        <option value="SR">Service requests</option>
      </select>
      <select className={set("status")} value={val("status")}onChange={(e) => onChange({ status: e.target.value || null })} aria-label="Status">
        <option value="">Open (any status)</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{statusLabel(s)}</option>
        ))}
      </select>
      <select className={set("priority")} value={val("priority")}onChange={(e) => onChange({ priority: e.target.value || null })} aria-label="Priority">
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
        <option value="P1,P2">P1 + P2</option>
      </select>
      <select className={set("assignedTo")} value={val("assignedTo")}onChange={(e) => onChange({ assignedTo: e.target.value || null })} aria-label="Owner">
        <option value="">All owners</option>
        <option value="__unassigned">Unassigned</option>
        {owners.map((o) => (
          <option key={o} value={o}>{o}</option>
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
      {active && (
        <button className="link" onClick={() => onChange({ q: null, type: null, status: null, priority: null, assignedTo: null, sla: null, stale: null, includeClosed: null })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
