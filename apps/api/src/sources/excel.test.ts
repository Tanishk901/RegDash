import ExcelJS from "exceljs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExcelSource, mapHeaders } from "./excel";

async function writeSheet(rows: unknown[][]): Promise<string> {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "regdash-")), "t.xlsx");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tickets");
  rows.forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(file);
  return file;
}

describe("mapHeaders", () => {
  it("matches aliases case-insensitively", () => {
    const m = mapHeaders(["Ticket No", "STATE", "Opened", "Owner", "Pending With", "Next Step"]);
    expect(m).toMatchObject({ number: 0, status: 1, createdAt: 2, assignedTo: 3, pendingOwner: 4, nextAction: 5 });
  });
});

describe("ExcelSource", () => {
  it("reads messy rows and reports the bad ones", async () => {
    const file = await writeSheet([
      ["Ticket No", "Short Description", "State", "Priority", "Owner", "Pending With", "Blocker", "Next Step", "Opened", "Last Updated"],
      ["INC0000101", "Login fails", "WIP", "1 - Critical", "Priya", "", "", "Check SSO", "25/09/2026 09:00", "26/09/2026 10:30"],
      ["RITM0000202", "New access", "Awaiting user", "Low", "", "Requester", "Missing manager approval", "Chase approval", new Date("2026-09-20T08:00:00Z"), ""],
      ["", "no number", "New", "P3", "", "", "", "", "25/09/2026", ""],
      ["INC0000103", "bad status", "Banana", "P3", "", "", "", "", "25/09/2026", ""],
      ["INC0000101", "duplicate", "New", "P3", "", "", "", "", "25/09/2026", ""],
    ]);
    const { tickets, rejected } = await new ExcelSource(file, "Tickets").fetchTickets();

    expect(tickets).toHaveLength(2);
    const [inc, sr] = tickets;
    expect(inc).toMatchObject({ number: "INC0000101", type: "INCIDENT", status: "IN_PROGRESS", priority: "P1", assignedTo: "Priya", nextAction: "Check SSO" });
    expect(sr).toMatchObject({ number: "RITM0000202", type: "SR", status: "ON_HOLD", priority: "P4", assignedTo: null, pendingOwner: "Requester", blocker: "Missing manager approval" });
    expect(sr!.updatedAt).toBe(sr!.createdAt); // empty "Last Updated" falls back to created

    expect(rejected.map((r) => r.reason)).toEqual([
      "missing ticket number",
      'unknown status "Banana"',
      "duplicate INC0000101",
    ]);
  });

  it("fails loudly when a required column is missing", async () => {
    const file = await writeSheet([["Summary", "Owner"], ["x", "y"]]);
    await expect(new ExcelSource(file, "Tickets").fetchTickets()).rejects.toThrow(/no column for "number"/);
  });
});
