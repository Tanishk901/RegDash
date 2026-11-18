import { describe, expect, it } from "vitest";
import { computeSla, computeSlaDetail, computeDetailedSla, findPolicy, formatDuration, formatEffort, getDefaultPolicy, toView } from "./sla";
import type { Ticket } from "./types";

const base: Ticket = {
  number: "INC0000001",
  type: "INCIDENT",
  shortDescription: "test",
  status: "IN_PROGRESS",
  priority: "P2", // 8h default SLA
  assignedTo: "A",
  assignmentGroup: "G",
  pendingOwner: null,
  blocker: null,
  nextAction: null,
  requestedBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  pendingSince: null,
  slaDueAt: null,
  taskHours: null,
  itemCount: null,
  updates: [],
  source: "mock",
  application: null,
  environment: null,
  configurationItem: null,
  serviceOffering: null,
};

describe("computeSla", () => {
  it("is OK early in the window", () => {
    expect(computeSla(base, new Date("2026-01-01T04:00:00Z"))).toBe("OK");
  });
  it("is AT_RISK after 75% of the window", () => {
    expect(computeSla(base, new Date("2026-01-01T07:00:00Z"))).toBe("AT_RISK");
  });
  it("is BREACHED past the due time", () => {
    expect(computeSla(base, new Date("2026-01-02T01:00:00Z"))).toBe("BREACHED");
  });
  it("prefers the source's own due date", () => {
    const t = { ...base, slaDueAt: "2026-01-10T00:00:00Z" };
    expect(computeSla(t, new Date("2026-01-02T01:00:00Z"))).toBe("OK");
  });
  it("is PAUSED while on hold, even past the due time", () => {
    const t = { ...base, status: "ON_HOLD" as const };
    expect(computeSla(t, new Date("2026-02-01T00:00:00Z"))).toBe("PAUSED");
  });
  it("never alarms on resolved tickets", () => {
    const t = { ...base, status: "RESOLVED" as const };
    expect(computeSla(t, new Date("2026-02-01T00:00:00Z"))).toBe("OK");
  });
});

describe("toView", () => {
  it("flags stale open tickets", () => {
    const v = toView(base, new Date("2026-01-04T00:00:00Z"));
    expect(v.stale).toBe(true);
    expect(Math.round(v.ageHours)).toBe(72);
  });
  it("computes pending time only for on-hold tickets", () => {
    const now = new Date("2026-01-03T00:00:00Z");
    const held = { ...base, status: "ON_HOLD" as const, pendingSince: "2026-01-02T00:00:00Z" };
    expect(toView(held, now).pendingHours).toBe(24);
    expect(toView({ ...held, status: "IN_PROGRESS" }, now).pendingHours).toBeNull();
  });
  it("estimates total time as time per task × items", () => {
    expect(toView({ ...base, taskHours: 0.5, itemCount: 36 }).estimatedHours).toBe(18);
    expect(toView({ ...base, taskHours: 0.5 }).estimatedHours).toBeNull();
  });
});

describe("formatEffort", () => {
  it("keeps effort in hours", () => {
    expect(formatEffort(72)).toBe("72h");
    expect(formatEffort(1.25)).toBe("1.3h");
    expect(formatEffort(0.25)).toBe("15m");
  });
});

describe("formatDuration", () => {
  it("formats", () => {
    expect(formatDuration(0.5)).toBe("30m");
    expect(formatDuration(5)).toBe("5h");
    expect(formatDuration(52)).toBe("2d 4h");
    expect(formatDuration(48)).toBe("2d");
  });
});

describe("findPolicy", () => {
  const policy = getDefaultPolicy();
  it("finds response entry for P1", () => {
    const entry = findPolicy(policy, "response", "P1");
    expect(entry).toEqual({ kind: "response", priority: "P1", targetHours: 0.5 });
  });
  it("finds resolution entry for P3", () => {
    const entry = findPolicy(policy, "resolution", "P3");
    expect(entry).toEqual({ kind: "resolution", priority: "P3", targetHours: 80 });
  });
});

describe("computeSlaDetail", () => {
  it("response is BREACHED when elapsed > target", () => {
    const detail = computeSlaDetail(base, "response", getDefaultPolicy(), new Date("2026-01-01T02:00:00Z"));
    expect(detail.state).toBe("BREACHED");
    expect(detail.kind).toBe("response");
    expect(detail.targetHours).toBe(1);
    expect(detail.available).toBe(true);
  });
  it("response is OK early in the window", () => {
    const detail = computeSlaDetail(base, "response", getDefaultPolicy(), new Date("2026-01-01T00:30:00Z"));
    expect(detail.state).toBe("OK");
  });
  it("resolution is AT_RISK after 75% of window", () => {
    const detail = computeSlaDetail(base, "resolution", getDefaultPolicy(), new Date("2026-01-01T07:00:00Z"));
    expect(detail.state).toBe("AT_RISK");
  });
  it("is PAUSED when ticket is ON_HOLD", () => {
    const held = { ...base, status: "ON_HOLD" as const };
    const detail = computeSlaDetail(held, "response", getDefaultPolicy(), new Date("2026-02-01T00:00:00Z"));
    expect(detail.state).toBe("PAUSED");
  });
  it("available is false when no matching policy entry", () => {
    const emptyPolicy = { name: "empty", entries: [] };
    const detail = computeSlaDetail(base, "response", emptyPolicy, new Date("2026-01-01T02:00:00Z"));
    expect(detail.available).toBe(false);
    expect(detail.targetHours).toBeNull();
  });
});

describe("computeDetailedSla", () => {
  it("overall SLA is worst of response and resolution", () => {
    const result = computeDetailedSla(base, getDefaultPolicy(), new Date("2026-01-01T02:00:00Z"));
    expect(result.response.state).toBe("BREACHED");
    expect(result.resolution.state).toBe("OK");
    expect(result.sla).toBe("BREACHED");
  });
  it("both clocks PAUSED when on hold", () => {
    const held = { ...base, status: "ON_HOLD" as const };
    const result = computeDetailedSla(held, getDefaultPolicy(), new Date("2026-02-01T00:00:00Z"));
    expect(result.response.state).toBe("PAUSED");
    expect(result.resolution.state).toBe("PAUSED");
    expect(result.sla).toBe("PAUSED");
  });
});

describe("toView with detailed SLA", () => {
  it("populates responseSla and resolutionSla", () => {
    const v = toView(base, new Date("2026-01-01T04:00:00Z"));
    expect(v.responseSla).not.toBeNull();
    expect(v.responseSla!.kind).toBe("response");
    expect(v.resolutionSla).not.toBeNull();
    expect(v.resolutionSla!.kind).toBe("resolution");
  });
});
