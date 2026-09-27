import { describe, expect, it } from "vitest";
import { extractTagged, inferType, normalizeDate, normalizePriority, normalizeStatus } from "./normalize";

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
