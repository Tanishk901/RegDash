import { useState } from "react";
import {
  GROUP_BY_FIELDS,
  type GroupByField,
  type SavedView,
  type SavedViewInput,
  type SortKey,
} from "@regdash/shared";
import { ALL_DISPLAY_COLUMNS, DEFAULT_COLUMN_KEYS } from "../lib/columns";

const GROUP_BY_LABELS: Record<string, string> = {
  assignedTo: "Owner",
  priority: "Priority",
  status: "Status",
  type: "Type",
  sla: "SLA",
  application: "Application",
  environment: "Environment",
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "sla", label: "Needs attention" },
  { value: "priority", label: "Priority" },
  { value: "age", label: "Oldest first" },
  { value: "updated", label: "Least recently updated" },
];

export function ViewBuilder({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SavedView;
  onSave: (input: SavedViewInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [columns, setColumns] = useState<Set<string>>(
    new Set(initial?.columns ?? DEFAULT_COLUMN_KEYS),
  );
  const [sort, setSort] = useState<SortKey>(initial?.sort ?? "sla");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial?.sortDir ?? "asc");
  const [groupBy, setGroupBy] = useState<GroupByField | null>(initial?.groupBy ?? null);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  const toggleColumn = (key: string) => {
    setColumns((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim() || columns.size === 0) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      columns: [...columns],
      filters: initial?.filters ?? {},
      sort,
      sortDir,
      groupBy,
      pinned,
    });
  };

  return (
    <div className="view-builder" role="dialog" aria-label={initial ? "Edit view" : "New view"}>
      <h3>{initial ? "Edit view" : "New view"}</h3>

      <div className="vb-field">
        <label htmlFor="vb-name">Name</label>
        <input
          id="vb-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My P1 incidents"
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="vb-field">
        <label htmlFor="vb-desc">Description</label>
        <input
          id="vb-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          maxLength={1000}
        />
      </div>

      <div className="vb-field">
        <label>Columns</label>
        <div className="vb-columns">
          {ALL_DISPLAY_COLUMNS.map((c) => (
            <label key={c.key} className="picker-item">
              <input
                type="checkbox"
                checked={columns.has(c.key)}
                onChange={() => toggleColumn(c.key)}
              />
              {c.header}
            </label>
          ))}
        </div>
        <span className="muted small">{columns.size} selected</span>
      </div>

      <div className="vb-row">
        <div className="vb-field">
          <label htmlFor="vb-sort">Sort</label>
          <select id="vb-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="vb-field">
          <label htmlFor="vb-dir">Direction</label>
          <select id="vb-dir" value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div className="vb-field">
          <label htmlFor="vb-group">Group by</label>
          <select id="vb-group" value={groupBy ?? ""} onChange={(e) => setGroupBy((e.target.value || null) as GroupByField | null)}>
            <option value="">None</option>
            {GROUP_BY_FIELDS.map((f) => (
              <option key={f} value={f}>{GROUP_BY_LABELS[f]}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="check vb-pin">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pin to navigation
      </label>

      <div className="vb-actions">
        <button className="button" onClick={handleSave} disabled={!name.trim() || columns.size === 0}>
          {initial ? "Save changes" : "Create view"}
        </button>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
