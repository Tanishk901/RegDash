import { describe, expect, it } from "vitest";
import {
  extractTagged,
  inferType,
  normalizeCount,
  normalizeDate,
  normalizeDuration,
  normalizePriority,
  normalizeStatus,
} from "./normalize";

describe("normalizeDuration", () => {
  it.each([
    ["2h", 2],
    ["1.5 hrs", 1.5],
    ["30 min", 0.5],
    ["1d 4h", 28],
    ["2 hours 30 mins", 2.5],
    ["2:30", 2.5],
    ["3", 3],
    [3, 3],
    [new Date(Date.UTC(1899, 11, 30, 2, 30)), 2.5], // Excel time-formatted cell
  ])("%s → %s hours", (raw, hours) => {
    expect(normalizeDuration(raw)).toBeCloseTo(hours);
  });
  it("reads bare numbers in the configured unit", () => {
    expect(normalizeDuration("45", "minutes")).toBe(0.75);
    expect(normalizeDuration(90, "minutes")).toBe(1.5);
  });
  it("returns null for blanks and nonsense", () => {
    expect(normalizeDuration("")).toBeNull();
    expect(normalizeDuration("tbd")).toBeNull();
    expect(normalizeDuration(null)).toBeNull();
  });
});

describe("normalizeCount", () => {
  it.each([["36", 36], [36, 36], ["36 items", 36], ["", null], ["none", null], [0, null]])("%s → %s", (raw, n) => {
    expect(normalizeCount(raw)).toBe(n);
  });
});

describe("normalizeStatus", () => {
  it.each([
    ["New", "NEW"],
    ["In Progress", "IN_PROGRESS"],
    ["WIP", "IN_PROGRESS"],
    ["Work in Progress", "IN_PROGRESS"],
    ["On Hold - Awaiting", "ON_HOLD"],
    ["Awaiting User Info", "ON_HOLD"],
    ["Pending", "ON_HOLD"],
    ["Resolved", "RESOLVED"],
    ["Closed Complete", "CLOSED"],
    ["Cancelled", "CLOSED"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeStatus(raw)).toBe(expected);
  });
  it("returns null for junk", () => expect(normalizeStatus("banana")).toBeNull());
});

describe("normalizePriority", () => {
  it.each([
    ["1 - Critical", "P1"],
    ["P2", "P2"],
    ["3", "P3"],
    ["5 - Planning", "P4"],
    ["High", "P2"],
    ["Low", "P4"],
  ])("%s → %s", (raw, expected) => expect(normalizePriority(raw)).toBe(expected));
});

describe("inferType", () => {
  it("uses explicit type column", () => expect(inferType("X1", "Service Request")).toBe("SR"));
  it("falls back to number prefix", () => {
    expect(inferType("INC0012345")).toBe("INCIDENT");
    expect(inferType("RITM0004567")).toBe("SR");
  });
});

describe("normalizeDate", () => {
  it("parses dd/mm/yyyy hh:mm", () => {
    const iso = normalizeDate("26/09/2026 14:05")!;
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 26, 14, 5]);
  });
  it("parses ServiceNow UTC format", () => {
    expect(normalizeDate("2026-09-26 10:00:00")).toBe("2026-09-26T10:00:00.000Z");
  });
  it("parses Excel serials", () => {
    expect(normalizeDate(46291)?.slice(0, 10)).toBe("2026-09-26");
  });
  it("rejects garbage", () => expect(normalizeDate("not a date")).toBeNull());
});

describe("extractTagged", () => {
  const note = "Called the user.\nNext: confirm role mapping\nBlocker - waiting on DB team";
  it("finds Next", () => expect(extractTagged(note, "next")).toBe("confirm role mapping"));
  it("finds Blocker", () => expect(extractTagged(note, "blocker")).toBe("waiting on DB team"));
  it("finds Next Action variant", () => expect(extractTagged("Next action: call", "next")).toBe("call"));
});
