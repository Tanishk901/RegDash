import { describe, expect, it } from "vitest";
import { GAUGE_LIMITS, gaugeBand, gaugeMetrics } from "./gauges";
import type { DashboardSummary, OwnerWorkload } from "./types";

const owner = (name: string, count: number) => ({ owner: name, count }) as OwnerWorkload;

const summary = (over: Partial<DashboardSummary>) =>
  ({ totalOpen: 0, onHold: 0, slaBreached: 0, slaAtRisk: 0, stale: 0, byOwner: [], ...over }) as DashboardSummary;

const byKey = (s: DashboardSummary) => Object.fromEntries(gaugeMetrics(s).map((m) => [m.key, m]));

describe("gaugeBand", () => {
  const limits = { watchAt: 10, highAt: 25 };

  it("switches band exactly at each limit", () => {
    expect([9, 10, 24, 25].map((p) => gaugeBand(p, limits))).toEqual(["OK", "WATCH", "WATCH", "HIGH"]);
  });
});

describe("gaugeMetrics", () => {
  it("leaves on-hold tickets out of the SLA gauges, whose clock is paused", () => {
    const g = byKey(summary({ totalOpen: 40, onHold: 20, slaBreached: 5, slaAtRisk: 2 }));
    expect(g.breached).toMatchObject({ count: 5, total: 20, percent: 25, totalLabel: "SLA running" });
    expect(g.atRisk).toMatchObject({ count: 2, total: 20, percent: 10 });
  });

  it("measures the other gauges against all open tickets", () => {
    const g = byKey(summary({ totalOpen: 40, onHold: 20, stale: 4, byOwner: [owner("Priya", 30), owner("Unassigned", 10)] }));
    expect(g.stale).toMatchObject({ total: 40, percent: 10 });
    expect(g.unassigned).toMatchObject({ count: 10, total: 40, percent: 25 });
    expect(g.onHold).toMatchObject({ count: 20, total: 40, percent: 50 });
  });

  it("reports 0% unassigned when everyone has an owner", () => {
    expect(byKey(summary({ totalOpen: 3, byOwner: [owner("Priya", 3)] })).unassigned).toMatchObject({ count: 0, percent: 0, band: "OK" });
  });

  it("bands the rounded percent, so the colour agrees with the number shown", () => {
    // 2 of 41 is 4.88%, shown as 5%, which is the breached gauge's Watch limit.
    expect(byKey(summary({ totalOpen: 41, slaBreached: 2 })).breached).toMatchObject({ percent: 5, band: "WATCH" });
  });

  it("has nothing to measure with no open tickets", () => {
    for (const m of gaugeMetrics(summary({}))) expect(m).toMatchObject({ percent: null, band: null });
  });

  it("has nothing to measure on SLA when every open ticket is on hold", () => {
    const g = byKey(summary({ totalOpen: 3, onHold: 3 }));
    expect(g.breached).toMatchObject({ percent: null, band: null });
    expect(g.onHold).toMatchObject({ percent: 100, band: "HIGH" });
  });

  it("keeps limits ordered", () => {
    for (const { watchAt, highAt } of Object.values(GAUGE_LIMITS)) expect(watchAt).toBeLessThan(highAt);
  });
});
