import type { ReactNode } from "react";
import { formatDuration, formatEffort, type TicketView } from "@regdash/shared";
import { PriorityBadge, SlaBadge, StatusBadge, TypeTag } from "../components/Badges";

export interface DisplayColumn {
  key: string;
  header: string;
  className?: string;
  render: (t: TicketView) => ReactNode;
}

const muted = (text: string) => <span className="muted">{text}</span>;

export const ALL_DISPLAY_COLUMNS: DisplayColumn[] = [
  {
    key: "number",
    header: "Ticket",
    render: (t) => (
      <span className="mono">
        <TypeTag t={t.type} /> {t.number}
      </span>
    ),
  },
  {
    key: "summary",
    header: "Summary",
    className: "summary",
    render: (t) => t.shortDescription,
  },
  {
    key: "application",
    header: "App",
    className: "app",
    render: (t) => t.application ?? muted("—"),
  },
  {
    key: "priority",
    header: "Priority",
    render: (t) => <PriorityBadge p={t.priority} />,
  },
  {
    key: "status",
    header: "Status",
    render: (t) => <StatusBadge s={t.status} />,
  },
  {
    key: "sla",
    header: "SLA",
    render: (t) => <SlaBadge s={t.sla} />,
  },
  {
    key: "owner",
    header: "Owner",
    render: (t) => t.assignedTo ?? muted("Unassigned"),
  },
  {
    key: "pendingOn",
    header: "Pending on",
    render: (t) => t.pendingOwner ?? muted("—"),
  },
  {
    key: "pendingFor",
    header: "Pending for",
    className: "num",
    render: (t) =>
      t.pendingHours != null ? (
        <span title={t.pendingSince ? `Since ${new Date(t.pendingSince).toLocaleString()}` : undefined}>
          {formatDuration(t.pendingHours)}
        </span>
      ) : (
        muted("—")
      ),
  },
  {
    key: "nextAction",
    header: "Next action",
    className: "next",
    render: (t) => t.nextAction ?? muted("Not set"),
  },
  {
    key: "taskHours",
    header: "Time / task",
    className: "num",
    render: (t) => (t.taskHours != null ? formatEffort(t.taskHours) : muted("—")),
  },
  {
    key: "estimatedH",
    header: "Est. total",
    className: "num",
    render: (t) =>
      t.estimatedHours != null ? (
        <>
          {formatEffort(t.estimatedHours)}
          <div className="muted small">{t.itemCount} items</div>
        </>
      ) : (
        muted("—")
      ),
  },
  {
    key: "ageH",
    header: "Age",
    className: "num",
    render: (t) => formatDuration(t.ageHours),
  },
  {
    key: "hoursSinceUpdate",
    header: "Updated",
    className: "num",
    render: (t) => (
      <span className={t.stale ? "stale" : undefined} title={t.stale ? "No update in 48h+" : undefined}>
        {formatDuration(t.hoursSinceUpdate)} ago
      </span>
    ),
  },
  {
    key: "type",
    header: "Type",
    render: (t) => <TypeTag t={t.type} />,
  },
  {
    key: "environment",
    header: "Environment",
    render: (t) => t.environment ?? muted("—"),
  },
  {
    key: "group",
    header: "Assignment group",
    render: (t) => t.assignmentGroup ?? muted("—"),
  },
  {
    key: "requestedBy",
    header: "Requested by",
    render: (t) => t.requestedBy ?? muted("—"),
  },
  {
    key: "blocker",
    header: "Blocker",
    render: (t) => t.blocker ?? muted("—"),
  },
  {
    key: "triage",
    header: "Triage",
    render: (t) => {
      const s = (t as TicketView & { triageStatus?: string }).triageStatus;
      if (!s) return muted("—");
      const cls = s === "approved" ? "triage-approved" : s === "rejected" ? "triage-rejected" : "triage-pending";
      return <span className={`triage-badge ${cls}`}>{s}</span>;
    },
  },
  {
    key: "pendingSince",
    header: "Pending since",
    render: (t) => (t.pendingSince ? new Date(t.pendingSince).toLocaleString() : muted("—")),
  },
  {
    key: "created",
    header: "Created",
    render: (t) => new Date(t.createdAt).toLocaleString(),
  },
  {
    key: "updated",
    header: "Last updated",
    render: (t) => new Date(t.updatedAt).toLocaleString(),
  },
];

/** The 14 columns shown in the default ticket table. */
export const DEFAULT_COLUMN_KEYS = [
  "number",
  "summary",
  "application",
  "priority",
  "status",
  "sla",
  "owner",
  "pendingOn",
  "pendingFor",
  "nextAction",
  "taskHours",
  "estimatedH",
  "ageH",
  "hoursSinceUpdate",
];

const columnMap = new Map(ALL_DISPLAY_COLUMNS.map((c) => [c.key, c]));

/** Look up display columns by key, skipping any unknown keys. */
export function resolveColumns(keys: string[]): DisplayColumn[] {
  return keys.map((k) => columnMap.get(k)).filter((c): c is DisplayColumn => !!c);
}
