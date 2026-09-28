import type { Priority, SlaState, TicketStatus, TicketType } from "@regdash/shared";

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const SLA_LABEL: Record<SlaState, string> = { OK: "On track", AT_RISK: "At risk", BREACHED: "Breached", PAUSED: "Paused" };

export const statusLabel = (s: TicketStatus) => STATUS_LABEL[s];

export function PriorityBadge({ p }: { p: Priority }) {
  return <span className={`badge prio prio-${p}`}>{p}</span>;
}

export function StatusBadge({ s }: { s: TicketStatus }) {
  return <span className={`badge status status-${s}`}>{STATUS_LABEL[s]}</span>;
}

export function SlaBadge({ s }: { s: SlaState }) {
  return <span className={`badge sla sla-${s}`}>{SLA_LABEL[s]}</span>;
}

export function TypeTag({ t }: { t: TicketType }) {
  return <span className={`type type-${t}`}>{t === "INCIDENT" ? "INC" : "SR"}</span>;
}
