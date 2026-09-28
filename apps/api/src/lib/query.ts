import {
  OPEN_STATUSES,
  PRIORITIES,
  STATUSES,
  toView,
  type DashboardSummary,
  type Priority,
  type SlaState,
  type SortKey,
  type Ticket,
  type TicketFilters,
  type TicketStatus,
  type TicketView,
} from "@regdash/shared";

const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
// Paused tickets are waiting on others, so they sort after everything the team can act on.
const SLA_RANK: Record<SlaState, number> = { BREACHED: 0, AT_RISK: 1, OK: 2, PAUSED: 3 };

export function applyFilters(views: TicketView[], f: TicketFilters): TicketView[] {
  const q = f.q?.trim().toLowerCase();
  return views.filter((t) => {
    if (!f.includeClosed && !f.status?.length && !OPEN_STATUSES.includes(t.status)) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.status?.length && !f.status.includes(t.status)) return false;
    if (f.priority?.length && !f.priority.includes(t.priority)) return false;
    if (f.sla && t.sla !== f.sla) return false;
    if (f.stale && !t.stale) return false;
    if (f.assignedTo) {
      if (f.assignedTo === "__unassigned") {
        if (t.assignedTo) return false;
      } else if (t.assignedTo !== f.assignedTo) return false;
    }
    if (q) {
      const hay = [t.number, t.shortDescription, t.assignedTo, t.pendingOwner, t.requestedBy, t.nextAction]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Default order = what needs attention first: SLA state, then priority, then oldest. */
export function sortViews(views: TicketView[], key: SortKey = "sla", dir: "asc" | "desc" = "asc"): TicketView[] {
  const cmp: Record<SortKey, (a: TicketView, b: TicketView) => number> = {
    sla: (a, b) =>
      SLA_RANK[a.sla] - SLA_RANK[b.sla] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.ageHours - a.ageHours,
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.ageHours - a.ageHours,
    age: (a, b) => b.ageHours - a.ageHours,
    updated: (a, b) => b.hoursSinceUpdate - a.hoursSinceUpdate,
  };
  const sorted = [...views].sort(cmp[key]);
  return dir === "desc" ? sorted.reverse() : sorted;
}

export function summarize(
  tickets: Ticket[],
  now: Date,
  meta: { lastRefreshedAt: string | null; source: Ticket["source"] },
): DashboardSummary {
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status)).map((t) => toView(t, now));
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
  const owners = new Map<string, number>();

  for (const t of tickets) byStatus[t.status]++;
  for (const t of open) {
    byPriority[t.priority]++;
    const o = t.assignedTo ?? "Unassigned";
    owners.set(o, (owners.get(o) ?? 0) + 1);
  }

  return {
    totalOpen: open.length,
    incidentsOpen: open.filter((t) => t.type === "INCIDENT").length,
    srsOpen: open.filter((t) => t.type === "SR").length,
    byPriority,
    byStatus,
    slaBreached: open.filter((t) => t.sla === "BREACHED").length,
    slaAtRisk: open.filter((t) => t.sla === "AT_RISK").length,
    stale: open.filter((t) => t.stale).length,
    onHold: open.filter((t) => t.status === "ON_HOLD").length,
    byOwner: [...owners.entries()]
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count),
    lastRefreshedAt: meta.lastRefreshedAt,
    source: meta.source,
  };
}
