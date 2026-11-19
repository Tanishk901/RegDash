import type { Priority, SlaState, TaskSlaRecord, Ticket, TicketSlaDetail, TicketView } from "./types";

// ── SLA Policy Model ──────────────────────────────────────────────────

export type SlaKind = "response" | "resolution";

export interface SlaPolicyEntry {
  kind: SlaKind;
  priority: Priority;
  targetHours: number;
}

export interface SlaPolicy {
  name: string;
  entries: SlaPolicyEntry[];
}

function buildPolicy(
  name: string,
  response: Record<Priority, number>,
  resolution: Record<Priority, number>,
): SlaPolicy {
  const entries: SlaPolicyEntry[] = [];
  for (const p of ["P1", "P2", "P3", "P4"] as Priority[]) {
    entries.push({ kind: "response", priority: p, targetHours: response[p] });
    entries.push({ kind: "resolution", priority: p, targetHours: resolution[p] });
  }
  return { name, entries };
}

// Support model: Silver, 16×5 (16 h/day, Mon–Fri).
// P1/P2 clock: 16×5 support window.  P3/P4 clock: business days (×16 h).

export const RESPONSE_SLA_HOURS: Record<Priority, number> = {
  P1: 0.5,   // 30 minutes
  P2: 1,     // 1 hour
  P3: 16,    // 1 business day
  P4: 16,    // 1 business day
};

export const DEFAULT_SLA_HOURS: Record<Priority, number> = {
  P1: 4,     // 4 hours
  P2: 8,     // 8 hours
  P3: 80,    // 5 business days (5 × 16 h)
  P4: 128,   // 8 business days (8 × 16 h)
};

const DEFAULT_POLICY = buildPolicy("Silver 16×5", RESPONSE_SLA_HOURS, DEFAULT_SLA_HOURS);

export function getDefaultPolicy(): SlaPolicy {
  return DEFAULT_POLICY;
}

export function findPolicy(
  policy: SlaPolicy,
  kind: SlaKind,
  priority: Priority,
): SlaPolicyEntry | undefined {
  return policy.entries.find((e) => e.kind === kind && e.priority === priority);
}

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

export function computeSlaDetail(
  ticket: Pick<Ticket, "createdAt" | "priority" | "status"> & { taskSlaRecords?: TaskSlaRecord[] },
  kind: SlaKind,
  policy: SlaPolicy = DEFAULT_POLICY,
  now: Date = new Date(),
): TicketSlaDetail {
  const real = ticket.taskSlaRecords?.find((r) => r.kind === kind);
  const entry = findPolicy(policy, kind, ticket.priority);
  if (real) {
    let state = real.stage;
    if (state === "OK" && entry && entry.targetHours > 0 &&
        real.businessTimeLeftHours / entry.targetHours <= 1 - AT_RISK_THRESHOLD) {
      state = "AT_RISK";
    }
    return {
      kind,
      state,
      targetHours: entry?.targetHours ?? null,
      elapsedHours: hoursBetween(ticket.createdAt, now),
      available: true,
    };
  }
  if (!entry) {
    return { kind, state: "OK", targetHours: null, elapsedHours: hoursBetween(ticket.createdAt, now), available: false };
  }
  const elapsed = hoursBetween(ticket.createdAt, now);
  let state: SlaState;
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    state = "OK";
  } else if (ticket.status === "ON_HOLD") {
    state = "PAUSED";
  } else if (elapsed >= entry.targetHours) {
    state = "BREACHED";
  } else if (entry.targetHours > 0 && elapsed / entry.targetHours >= AT_RISK_THRESHOLD) {
    state = "AT_RISK";
  } else {
    state = "OK";
  }
  return { kind, state, targetHours: entry.targetHours, elapsedHours: elapsed, available: true };
}

export function computeDetailedSla(
  ticket: Pick<Ticket, "createdAt" | "priority" | "slaDueAt" | "status">,
  policy: SlaPolicy = DEFAULT_POLICY,
  now: Date = new Date(),
): { sla: SlaState; response: TicketSlaDetail; resolution: TicketSlaDetail } {
  const response = computeSlaDetail(ticket, "response", policy, now);
  const resolution = computeSlaDetail(ticket, "resolution", policy, now);
  const SLA_SEVERITY: Record<SlaState, number> = { BREACHED: 3, AT_RISK: 2, PAUSED: 1, OK: 0 };
  const sla = SLA_SEVERITY[response.state] >= SLA_SEVERITY[resolution.state] ? response.state : resolution.state;
  return { sla, response, resolution };
}

export function toView(ticket: Ticket, now: Date = new Date(), policy?: SlaPolicy): TicketView {
  const hoursSinceUpdate = hoursBetween(ticket.updatedAt, now);
  const open = ticket.status !== "RESOLVED" && ticket.status !== "CLOSED";
  const detailed = computeDetailedSla(ticket, policy, now);
  return {
    ...ticket,
    ageHours: hoursBetween(ticket.createdAt, now),
    hoursSinceUpdate,
    sla: computeSla(ticket, now),
    responseSla: detailed.response,
    resolutionSla: detailed.resolution,
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
