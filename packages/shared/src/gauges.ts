import type { DashboardSummary } from "./types";

/** Owner name used for tickets nobody has picked up. */
export const UNASSIGNED = "Unassigned";

export type GaugeBand = "OK" | "WATCH" | "HIGH";

/**
 * Where each gauge turns from OK to Watch and from Watch to High, in percent.
 * These are PLACEHOLDERS — replace with the limits the team actually agrees on.
 */
export const GAUGE_LIMITS = {
  breached: { watchAt: 5, highAt: 15 },
  atRisk: { watchAt: 10, highAt: 25 },
  stale: { watchAt: 10, highAt: 25 },
  unassigned: { watchAt: 10, highAt: 25 },
  onHold: { watchAt: 25, highAt: 50 },
  highPriority: { watchAt: 25, highAt: 50 },
} as const;

export interface GaugeMetric {
  key: keyof typeof GAUGE_LIMITS;
  label: string;
  /** Tickets in this state, out of `total`. */
  count: number;
  total: number;
  /** What `total` counts, for display: "27 of 40 {totalLabel}". */
  totalLabel: string;
  /** Whole percent, so the band always agrees with the number shown. null = nothing to measure. */
  percent: number | null;
  band: GaugeBand | null;
  watchAt: number;
  highAt: number;
  /** Filter params applied when the gauge is clicked. */
  filter: Record<string, string>;
  hint: string;
}

export function gaugeBand(percent: number, { watchAt, highAt }: { watchAt: number; highAt: number }): GaugeBand {
  if (percent >= highAt) return "HIGH";
  return percent >= watchAt ? "WATCH" : "OK";
}

/** The share of open work in each state that needs attention. Higher is always worse. */
export function gaugeMetrics(summary: DashboardSummary): GaugeMetric[] {
  // On-hold tickets have their SLA clock paused, so they can't count for or against SLA.
  const running = summary.totalOpen - summary.onHold;
  const unassigned = summary.byOwner.find((o) => o.owner === UNASSIGNED)?.count ?? 0;

  const metric = (
    key: GaugeMetric["key"],
    label: string,
    count: number,
    total: number,
    totalLabel: string,
    filter: Record<string, string>,
    hint: string,
  ): GaugeMetric => {
    const limits = GAUGE_LIMITS[key];
    const percent = total > 0 ? Math.round((count / total) * 100) : null;
    return { key, label, count, total, totalLabel, percent, band: percent === null ? null : gaugeBand(percent, limits), ...limits, filter, hint };
  };

  return [
    metric("breached", "SLA breached", summary.slaBreached, running, "SLA running", { sla: "BREACHED" }, "Past their SLA due time, out of open tickets whose SLA clock is running"),
    metric("atRisk", "SLA at risk", summary.slaAtRisk, running, "SLA running", { sla: "AT_RISK" }, "Close to their SLA due time, out of open tickets whose SLA clock is running"),
    metric("stale", "Stale", summary.stale, summary.totalOpen, "open", { stale: "true", sort: "updated" }, "No update in 48 hours, out of all open tickets"),
    metric("unassigned", "Unassigned", unassigned, summary.totalOpen, "open", { assignedTo: "__unassigned" }, "Nobody has picked these up, out of all open tickets"),
    metric("onHold", "On hold", summary.onHold, summary.totalOpen, "open", { status: "ON_HOLD" }, "Waiting on someone outside the team, out of all open tickets"),
    metric("highPriority", "High priority", summary.byPriority.P1 + summary.byPriority.P2, summary.totalOpen, "open", { priority: "P1,P2" }, "P1 and P2, out of all open tickets"),
  ];
}
