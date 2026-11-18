import type { Priority, SlaState, TicketSlaDetail, TicketStatus, TicketType } from "@regdash/shared";

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

const KIND_LABEL = { response: "Resp", resolution: "Resol" } as const;

export function SlaDetailBadge({ detail }: { detail: TicketSlaDetail }) {
  if (!detail.available) {
    return <span className="badge sla-detail sla-detail-na">{KIND_LABEL[detail.kind]}: N/A</span>;
  }
  const hours = detail.targetHours != null ? `${detail.targetHours}h` : "—";
  return (
    <span className={`badge sla-detail sla-detail-${detail.state}`} title={`${detail.kind} SLA: ${SLA_LABEL[detail.state]} (target ${hours})`}>
      {KIND_LABEL[detail.kind]}: {SLA_LABEL[detail.state]}
    </span>
  );
}
