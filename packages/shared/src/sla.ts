import type { Priority, SlaState, Ticket, TicketView } from "./types";

/**
 * Default resolution targets in hours, used only when the source gives no SLA
 * due date. These are PLACEHOLDERS — replace with your team's real SLA matrix.
 */
export const DEFAULT_SLA_HOURS: Record<Priority, number> = {
  P1: 4,
  P2: 24,
  P3: 72,
  P4: 120,
};

/** Fraction of the SLA window after which a ticket counts as "at risk". */
export const AT_RISK_THRESHOLD = 0.75;

/** No update for this many hours => flagged stale. */
export const STALE_AFTER_HOURS = 48;

const HOUR = 60 * 60 * 1000;

export function hoursBetween(fromIso: string, to: Date): number {
  return Math.max(0, (to.getTime() - new Date(fromIso).getTime()) / HOUR);
}

export function slaDueAt(ticket: Pick<Ticket, "createdAt" | "priority" | "slaDueAt">): Date {
  if (ticket.slaDueAt) return new Date(ticket.slaDueAt);
  return new Date(new Date(ticket.createdAt).getTime() + DEFAULT_SLA_HOURS[ticket.priority] * HOUR);
}

export function computeSla(
  ticket: Pick<Ticket, "createdAt" | "priority" | "slaDueAt" | "status">,
  now: Date = new Date(),
): SlaState {
  // Closed/resolved tickets are judged elsewhere; don't alarm on them.
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return "OK";
  // The team's SLA clock is paused while a ticket is pending on someone else.
  if (ticket.status === "ON_HOLD") return "PAUSED";
  // KNOWN GAP: after a ticket leaves ON_HOLD the clock should resume where it
  // stopped, but the Excel tracker has no pause history, so time spent paused
  // is still counted below. ServiceNow can fix this via task_sla (Phase 1.1).
  const created = new Date(ticket.createdAt).getTime();
  const due = slaDueAt(ticket).getTime();
  const nowMs = now.getTime();
  if (nowMs >= due) return "BREACHED";
  const window = due - created;
  if (window > 0 && (nowMs - created) / window >= AT_RISK_THRESHOLD) return "AT_RISK";
  return "OK";
}

export function toView(ticket: Ticket, now: Date = new Date()): TicketView {
  const hoursSinceUpdate = hoursBetween(ticket.updatedAt, now);
  const open = ticket.status !== "RESOLVED" && ticket.status !== "CLOSED";
  return {
    ...ticket,
    ageHours: hoursBetween(ticket.createdAt, now),
    hoursSinceUpdate,
    sla: computeSla(ticket, now),
    stale: open && hoursSinceUpdate >= STALE_AFTER_HOURS,
    pendingHours:
      ticket.status === "ON_HOLD" && ticket.pendingSince ? hoursBetween(ticket.pendingSince, now) : null,
    estimatedHours:
      ticket.taskHours != null && ticket.itemCount != null ? ticket.taskHours * ticket.itemCount : null,
  };
}

/** Effort, always in hours so it isn't read as calendar days: "72h", "1.5h", "15m". */
export function formatEffort(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Math.round(hours * 10) / 10}h`;
}

/** "3d 4h", "5h", "20m" */
export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  return h ? `${d}d ${h}h` : `${d}d`;
}
