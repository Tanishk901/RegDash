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

async function writeBook(sheets: Record<string, unknown[][]>, hidden: string[] = []): Promise<string> {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "regdash-")), "t.xlsx");
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name, { state: hidden.includes(name) ? "hidden" : "visible" });
    rows.forEach((r) => ws.addRow(r));
  }
  await wb.xlsx.writeFile(file);
  return file;
}

/** Reads a workbook with no sheet named "Tickets", so the sheet rules apply. */
const read = async (sheets: Record<string, unknown[][]>, hidden?: string[]) =>
  new ExcelSource(await writeBook(sheets, hidden), "Tickets").fetchTickets();

const columnFor = (r: Awaited<ReturnType<typeof read>>, field: string, sheet = 0) =>
  r.reading!.sheets[sheet]!.columns.find((c) => c.field === field);

const OPEN = ["In Progress", "25/09/2026"];

describe("finding the table", () => {
  it("finds headers below a title and notes", async () => {
    const r = await read({
      Sheet1: [["RegCreate tracker"], ["Updated weekly"], [], ["Number", "Status", "Created"], ["INC0000101", ...OPEN]],
    });
    expect(r.tickets.map((t) => t.number)).toEqual(["INC0000101"]);
    expect(r.reading!.sheets[0]!.headerRow).toBe(4);
    expect(r.rejected).toEqual([]);
  });

  it("matches names through case and punctuation", async () => {
    const r = await read({ Sheet1: [["TICKET_NO.", "State:", "Opened"], ["INC0000101", ...OPEN]] });
    expect(r.tickets).toHaveLength(1);
    const hash = await read({ Sheet1: [["Ticket #", "Status", "Created"], ["INC0000102", ...OPEN]] });
    expect(hash.tickets).toHaveLength(1);
  });

  it.each([
    ["Incident ID", "Current Status", "Date Raised"],
    ["Request Number", "Ticket State", "Logged On"],
    ["Case No", "Overall Status", "Date Reported"],
  ])("understands the names %s / %s / %s", async (number, status, created) => {
    const r = await read({ Sheet1: [[number, status, created], ["INC0000101", ...OPEN]] });
    expect(r.tickets).toHaveLength(1);
    expect(columnFor(r, "number")).toEqual({ field: "number", header: number, how: "name" });
    expect(columnFor(r, "status")?.header).toBe(status);
    expect(columnFor(r, "createdAt")?.header).toBe(created);
  });

  it("lists the columns it didn't use", async () => {
    const r = await read({ Sheet1: [["Number", "Status", "Created", "Region", "Vendor"], ["INC0000101", ...OPEN, "EMEA", "Acme"]] });
    expect(r.reading!.sheets[0]!.ignoredHeaders).toEqual(["Region", "Vendor"]);
  });
});

describe("finding the ticket number", () => {
  it("doesn't take Sr No as a ticket when it's a row counter", async () => {
    const r = await read({
      Sheet1: [
        ["Sr No", "Incident Number", "Status", "Created"],
        [1, "INC0000101", ...OPEN],
        [2, "RITM0000102", ...OPEN],
      ],
    });
    expect(r.tickets.map((t) => [t.number, t.type])).toEqual([["INC0000101", "INCIDENT"], ["RITM0000102", "SR"]]);
    expect(columnFor(r, "number")?.header).toBe("Incident Number");
    expect(r.reading!.sheets[0]!.ignoredHeaders).toContain("Sr No");
  });

  it("treats a counter as no ticket column, even if rows were deleted from it", async () => {
    const file = await writeBook({ Sheet1: [["S.No", "Status", "Created"], [1, ...OPEN], [4, ...OPEN], [9, ...OPEN]] });
    await expect(new ExcelSource(file, "Tickets").fetchTickets()).rejects.toThrow(/no column for "number"/);
  });

  it("takes Sr No when it really holds service requests", async () => {
    const r = await read({ Sheet1: [["SR No", "Status", "Created"], ["SR-104", ...OPEN], ["SR-105", ...OPEN]] });
    expect(r.tickets.map((t) => [t.number, t.type])).toEqual([["SR-104", "SR"], ["SR-105", "SR"]]);
  });

  it("skips a consecutive ID column for one holding ticket numbers", async () => {
    const r = await read({
      Sheet1: [
        ["ID", "Reference", "Status", "Created"],
        [1, "INC0000101", ...OPEN],
        [2, "INC0000102", ...OPEN],
      ],
    });
    expect(r.tickets.map((t) => t.number)).toEqual(["INC0000101", "INC0000102"]);
  });

  it("recognises ticket numbers by contents when the name gives nothing away", async () => {
    const r = await read({ Sheet1: [["Item", "Status", "Created"], ["INC0000101", ...OPEN], ["RITM0000102", ...OPEN]] });
    expect(r.tickets).toHaveLength(2);
    expect(columnFor(r, "number")).toEqual({ field: "number", header: "Item", how: "contents" });
  });

  it("reads separate incident and SR number columns", async () => {
    const r = await read({
      Sheet1: [
        ["INC No", "SR No", "Status", "Created"],
        ["INC0000101", "", ...OPEN],
        ["", "RITM0000102", ...OPEN],
      ],
    });
    expect(r.rejected).toEqual([]);
    expect(r.tickets.map((t) => [t.number, t.type])).toEqual([["INC0000101", "INCIDENT"], ["RITM0000102", "SR"]]);
  });

  it("treats an ID column counting from 1 as a row counter, but not one holding real numbers", async () => {
    const counter = await writeBook({ Sheet1: [["ID", "Status", "Created"], [1, ...OPEN], [2, ...OPEN], [3, ...OPEN]] });
    await expect(new ExcelSource(counter, "Tickets").fetchTickets()).rejects.toThrow(/no column for "number"/);

    const r = await read({ Sheet1: [["ID", "Type", "Status", "Created"], [50231, "SR", ...OPEN], [50232, "SR", ...OPEN]] });
    expect(r.tickets.map((t) => t.number)).toEqual(["50231", "50232"]);
  });

  it("still accepts plain numbers under a real ticket column, typed by another column", async () => {
    const r = await read({ Sheet1: [["Ticket", "Type", "Status", "Created"], [50231, "Incident", ...OPEN], [50077, "SR", ...OPEN]] });
    expect(r.tickets.map((t) => [t.number, t.type])).toEqual([["50231", "INCIDENT"], ["50077", "SR"]]);
  });
});

describe("deciding incident or SR", () => {
  it("counts where each type came from and reports disagreements", async () => {
    const r = await read({
      Sheet1: [
        ["Number", "Type", "Status", "Created"],
        ["INC0000101", "Incident", ...OPEN],
        ["RITM0000102", "", ...OPEN],
        ["INC0000103", "Service Request", ...OPEN],
      ],
    });
    expect(r.tickets.map((t) => t.type)).toEqual(["INCIDENT", "SR", "SR"]);
    expect(r.reading!.typedBy).toEqual({ column: 2, number: 1, sheet: 0 });
    expect(r.reading!.typeConflicts).toEqual([{ number: "INC0000103", column: "SR", prefix: "INCIDENT" }]);
  });

  it("falls back to the prefix when a Request Type column holds something else", async () => {
    const r = await read({ Sheet1: [["Number", "Request Type", "Status", "Created"], ["INC0000101", "Access", ...OPEN]] });
    expect(r.tickets[0]!.type).toBe("INCIDENT");
    expect(r.reading!.typedBy.number).toBe(1);
  });

  it("recognises a type column by contents", async () => {
    const r = await read({
      Sheet1: [
        ["Ticket", "Category", "Status", "Created"],
        [50231, "Incident", ...OPEN],
        [50077, "SR", ...OPEN],
      ],
    });
    expect(r.tickets.map((t) => t.type)).toEqual(["INCIDENT", "SR"]);
    expect(columnFor(r, "type")).toEqual({ field: "type", header: "Category", how: "contents" });
  });

  it("isn't fooled by a column that only mentions a type", async () => {
    const r = await read({
      Sheet1: [
        ["Number", "Group", "Status", "Created"],
        ["RITM0000101", "Incident Team", ...OPEN],
        ["RITM0000102", "Incident Team", ...OPEN],
      ],
    });
    expect(r.tickets.map((t) => t.type)).toEqual(["SR", "SR"]);
    expect(columnFor(r, "type")).toBeUndefined();
  });

  it("rejects a row nothing can classify, rather than guessing from its description", async () => {
    const r = await read({ Sheet1: [["Ticket", "Short Description", "Status", "Created"], [50231, "Service request for incident report", ...OPEN]] });
    expect(r.tickets).toEqual([]);
    expect(r.rejected).toEqual([{ row: "row 2", reason: "cannot tell if 50231 is an incident or SR" }]);
  });
});

describe("choosing sheets", () => {
  const rows = (...numbers: unknown[]) => [["Ticket", "Status", "Created"], ...numbers.map((n) => [n, ...OPEN])];

  it("reads incident and SR sheets, typing plain numbers from the sheet name", async () => {
    const r = await read({ Incidents: rows(50231), "Service Requests": rows(50077) });
    expect(r.tickets.map((t) => [t.number, t.type])).toEqual([["50231", "INCIDENT"], ["50077", "SR"]]);
    expect(r.reading!.typedBy.sheet).toBe(2);
    expect(r.reading!.sheets.map((s) => [s.name, s.tickets])).toEqual([["Incidents", 1], ["Service Requests", 1]]);
  });

  it("names the sheet in a rejection when it read several", async () => {
    const r = await read({ Incidents: rows("INC0000101"), Requests: rows("INC0000101") });
    expect(r.rejected).toEqual([{ row: '"Requests" row 2', reason: "duplicate INC0000101" }]);
  });

  it("finds the tracker behind a summary sheet, and says what it skipped", async () => {
    const r = await read({ Summary: [["Total", 2], ["Owner", "Priya"]], Tracker: rows("INC0000101") });
    expect(r.tickets).toHaveLength(1);
    expect(r.reading!.skippedSheets).toEqual([{ name: "Summary", reason: "no number column" }]);
  });

  it("skips archives and copies, unless nothing else has tickets", async () => {
    const r = await read({ Live: rows("INC0000101"), "Archive 2025": rows("INC0000900"), "Copy of Live": rows("INC0000101") });
    expect(r.tickets.map((t) => t.number)).toEqual(["INC0000101"]);
    expect(r.reading!.skippedSheets.map((s) => s.reason)).toEqual(["looks like an archive or copy", "looks like an archive or copy"]);

    const only = await read({ "Backup copy": rows("INC0000101") });
    expect(only.tickets).toHaveLength(1);
  });

  it("skips hidden sheets", async () => {
    const r = await read({ Live: rows("INC0000101"), Lists: rows("INC0000900") }, ["Lists"]);
    expect(r.tickets.map((t) => t.number)).toEqual(["INC0000101"]);
  });

  it("uses only the configured sheet when the workbook has it", async () => {
    const file = await writeBook({ Other: rows("INC0000900"), Tickets: rows("INC0000101") });
    const r = await new ExcelSource(file, "Tickets").fetchTickets();
    expect(r.tickets.map((t) => t.number)).toEqual(["INC0000101"]);
    expect(r.reading!.sheets.map((s) => s.name)).toEqual(["Tickets"]);
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

  it("reads hand-entered time per task and item count", async () => {
    const file = await writeSheet([
      ["Number", "Status", "Created", "Avg Time (hrs)", "No. of Items"],
      ["RITM0000301", "In Progress", "25/09/2026", "30 min", 36],
      ["RITM0000302", "In Progress", "25/09/2026", 2, ""],
      ["RITM0000303", "In Progress", "25/09/2026", "", ""],
    ]);
    const { tickets } = await new ExcelSource(file, "Tickets").fetchTickets();
    expect(tickets.map((t) => [t.taskHours, t.itemCount])).toEqual([[0.5, 36], [2, null], [null, null]]);
  });

  it("fails loudly when a required column is missing", async () => {
    const file = await writeSheet([["Summary", "Owner"], ["x", "y"]]);
    await expect(new ExcelSource(file, "Tickets").fetchTickets()).rejects.toThrow(/no column for "number"/);
  });
});
