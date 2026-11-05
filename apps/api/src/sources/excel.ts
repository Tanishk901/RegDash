import ExcelJS from "exceljs";
import path from "node:path";
import type { SourceReading, Ticket, TicketType } from "@regdash/shared";
import type { SourceResult, TicketSource } from "./TicketSource";
import {
  classifyType,
  isTypeLabel,
  normalizeCount,
  normalizeDate,
  normalizeDuration,
  normalizePriority,
  normalizeStatus,
  normalizeText,
  typeFromNumber,
  typeFromText,
  type DurationUnit,
} from "../lib/normalize";

/**
 * Reads the team tracker workbook (a local or OneDrive-synced copy of the
 * SharePoint file). Headers are matched case-insensitively and several common
 * aliases are accepted, so the sheet doesn't need to be restructured. When the
 * names aren't enough, a column's contents decide. Every assumption made is
 * reported in `reading`, so it can be checked in the dashboard.
 *
 * Phase 1.1: replace the local path with a Microsoft Graph download
 * (GET /sites/{site}/drive/items/{id}/content) once Graph access is approved.
 */

type Field =
  | "number" | "type" | "shortDescription" | "description" | "status" | "priority"
  | "assignedTo" | "assignmentGroup" | "pendingOwner" | "blocker" | "nextAction"
  | "requestedBy" | "createdAt" | "updatedAt" | "pendingSince" | "slaDueAt" | "lastUpdateNote"
  | "taskHours" | "itemCount";

export const HEADER_ALIASES: Record<Field, string[]> = {
  number: ["number", "ticket", "ticket number", "ticket no", "inc/sr number", "id", "incident", "inc", "sr", "ritm", "reference"],
  type: ["type", "ticket type", "category type", "incident/sr", "inc/sr", "sr/inc", "incident or sr", "inc or sr"],
  shortDescription: ["short description", "summary", "title", "issue"],
  description: ["description", "details"],
  status: ["status", "state"],
  priority: ["priority", "severity", "sev"],
  assignedTo: ["assigned to", "owner", "assignee", "engineer"],
  assignmentGroup: ["assignment group", "group", "team"],
  pendingOwner: ["pending owner", "pending with", "waiting on", "pending on"],
  blocker: ["blocker", "blocked by", "pending reason", "hold reason"],
  nextAction: ["next action", "next step", "next steps", "action"],
  requestedBy: ["requested by", "caller", "requester", "raised by"],
  createdAt: ["created", "opened", "created on", "opened at", "created date"],
  updatedAt: ["updated", "last updated", "updated on", "modified"],
  pendingSince: ["pending since", "on hold since"],
  slaDueAt: ["sla due", "due", "due date", "sla"],
  lastUpdateNote: ["latest update", "last update", "comments", "work notes", "remarks"],
  // Hand-entered by the team. Aliases are guesses until checked against the real tracker.
  taskHours: [
    "avg time", "average time", "avg time per task", "average time per task", "time per task",
    "time per item", "avg time per item", "average time per item", "time taken per task", "effort",
  ],
  itemCount: ["items", "no of items", "no. of items", "number of items", "item count", "n", "qty", "quantity"],
};

// Punctuation and a trailing unit note like "Avg Time (hrs)" are ignored, so "Ticket_No." and "Ticket #" both match.
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/#/g, " no ")
    .replace(/[._:/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALIASES = (Object.entries(HEADER_ALIASES) as [Field, string[]][]).map(
  ([field, aliases]) => [field, new Set(aliases.map(norm))] as const,
);

const NUMBER_HEADER = /\b(ticket|incident|inc|sr|ritm|req|request|case|task|ref|reference)\b.*\b(number|no|num|id|ref|reference)\b/;

/** For names no list could cover: "Incident ID", "Current Status", "Date Raised". Tried after the exact aliases. */
const HEADER_PATTERNS: Partial<Record<Field, RegExp>> = {
  number: NUMBER_HEADER,
  type: /\b(ticket|request|record|task|incident|item|work)\b.*\btype\b|\btype of\b/,
  status: /\b(ticket|current|incident|request|sr|task|overall)\b.*\b(status|state)\b/,
  createdAt:
    /\b(created|opened|raised|logged|reported|received|submitted)\b.*\b(date|on|at|time)\b|\b(date|time)\b.*\b(created|opened|raised|logged|reported|received|submitted)\b/,
};

export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  const used = new Set<number>();
  const keys = headers.map(norm);
  keys.forEach((key, idx) => {
    for (const [field, aliases] of ALIASES) {
      if (out[field] === undefined && aliases.has(key)) {
        out[field] = idx;
        used.add(idx);
      }
    }
  });
  for (const [field, pattern] of Object.entries(HEADER_PATTERNS) as [Field, RegExp][]) {
    if (out[field] !== undefined) continue;
    const idx = keys.findIndex((key, i) => key && !used.has(i) && pattern.test(key));
    if (idx >= 0) {
      out[field] = idx;
      used.add(idx);
    }
  }
  return out;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  // rich text, hyperlinks, formulas → use the rendered text / result
  if (typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
  return cell.text;
}

export function rowToTicket(
  get: (f: Field) => unknown,
  rowLabel: string,
  timeUnit: DurationUnit = "hours",
  sheetType: TicketType | null = null,
): { ticket?: Ticket; reason?: string; decision?: ReturnType<typeof classifyType> } {
  const number = normalizeText(get("number"));
  if (!number) return { reason: "missing ticket number" };
  const decision = classifyType(number, get("type"), sheetType);
  const { type } = decision;
  if (!type) return { reason: `cannot tell if ${number} is an incident or SR` };
  const status = normalizeStatus(get("status"));
  if (!status) return { reason: `unknown status "${String(get("status") ?? "")}"` };
  const priority = normalizePriority(get("priority")) ?? "P3";
  const createdAt = normalizeDate(get("createdAt"));
  if (!createdAt) return { reason: "missing/invalid created date" };
  const updatedAt = normalizeDate(get("updatedAt")) ?? createdAt;
  const note = normalizeText(get("lastUpdateNote"));
  const assignedTo = normalizeText(get("assignedTo"));

  return {
    decision,
    ticket: {
      number: number.toUpperCase(),
      type,
      shortDescription: normalizeText(get("shortDescription")) ?? "(no description)",
      description: normalizeText(get("description")) ?? undefined,
      status,
      priority,
      assignedTo,
      assignmentGroup: normalizeText(get("assignmentGroup")),
      pendingOwner: normalizeText(get("pendingOwner")),
      blocker: normalizeText(get("blocker")),
      nextAction: normalizeText(get("nextAction")),
      requestedBy: normalizeText(get("requestedBy")),
      createdAt,
      updatedAt,
      pendingSince: normalizeDate(get("pendingSince")),
      slaDueAt: normalizeDate(get("slaDueAt")),
      taskHours: normalizeDuration(get("taskHours"), timeUnit),
      itemCount: normalizeCount(get("itemCount")),
      updates: note ? [{ at: updatedAt, by: assignedTo ?? "Tracker", note }] : [],
      source: "excel",
    },
  };
}

const REQUIRED = ["number", "status", "createdAt"] as const;
const HEADER_SCAN_ROWS = 10;
const SAMPLE_ROWS = 500;
/** A column counts as holding something once this share of its filled cells look like it. */
const MOSTLY = 0.5;
const SERIAL_HEADER = /^(s|sr|sl|serial) ?(no|num|number)?$|^serial\b/;
const NOT_LIVE_SHEET = /\b(archive[sd]?|backup|old|copy|template|sample|instructions?|readme|lookups?)\b/i;

interface Layout {
  ws: ExcelJS.Worksheet;
  headerRow: number;
  headers: string[];
  map: Partial<Record<Field, number>>;
  /** Usually one. Trackers can keep incidents and SRs in separate number columns. */
  numberColumns: number[];
  byContents: Set<Field>;
  missing: (typeof REQUIRED)[number][];
}

function readHeaders(ws: ExcelJS.Worksheet, rowNumber: number): string[] {
  const headers: string[] = [];
  ws.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.text ?? "");
  });
  return Array.from(headers, (h) => h ?? "");
}

/** Trackers often have a title or notes above the table, so the headers are the best match near the top. */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  let best = { row: 1, score: 1 };
  for (let row = 1; row <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); row++) {
    const score = Object.keys(mapHeaders(readHeaders(ws, row))).length;
    if (score > best.score) best = { row, score };
  }
  return best.row;
}

/** The filled cells of a column, from the rows under the headers. */
function columnValues(ws: ExcelJS.Worksheet, headerRow: number, idx: number): unknown[] {
  const values: unknown[] = [];
  const last = Math.min(ws.rowCount, headerRow + SAMPLE_ROWS);
  for (let row = headerRow + 1; row <= last; row++) {
    const v = cellValue(ws.getRow(row).getCell(idx + 1));
    if (v != null && String(v).trim()) values.push(v);
  }
  return values;
}

const share = (values: unknown[], test: (v: unknown) => boolean) =>
  values.length ? values.filter(test).length / values.length : 0;

/** "Sr No" in most spreadsheets means serial number, not service request: a row counter, not a ticket. */
function isRowCounter(header: string, values: unknown[]): boolean {
  const ints = values.map((v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : null));
  if (!ints.length || ints.some((n) => n === null)) return false;
  if (SERIAL_HEADER.test(norm(header))) return true;
  return ints[0]! <= 1 && ints.every((n, i) => i === 0 || n === ints[i - 1]! + 1);
}

function findNumberColumns(ws: ExcelJS.Worksheet, layout: Pick<Layout, "headerRow" | "headers">): { columns: number[]; byContents: boolean } {
  const { headerRow, headers } = layout;
  const named = (key: string) => ALIASES.find(([f]) => f === "number")![1].has(key) || NUMBER_HEADER.test(key);
  const columns = headers.map((header, idx) => {
    const values = columnValues(ws, headerRow, idx);
    return { idx, header, values, named: named(norm(header)), ticketLike: share(values, (v) => typeFromNumber(v) !== null) };
  });

  const namedTickets = columns.filter((c) => c.named && c.ticketLike >= MOSTLY);
  if (namedTickets.length) return { columns: namedTickets.map((c) => c.idx), byContents: false };

  // A column the name doesn't explain, but which is plainly full of ticket numbers, beats a name alone.
  const anyTickets = columns.filter((c) => c.ticketLike >= MOSTLY).sort((a, b) => b.ticketLike - a.ticketLike)[0];
  if (anyTickets) return { columns: [anyTickets.idx], byContents: true };

  const fallback = columns.find((c) => c.named && !isRowCounter(c.header, c.values));
  return { columns: fallback ? [fallback.idx] : [], byContents: false };
}

/** A column of mostly bare "Incident" / "SR" labels is a type column, whatever it's called. */
function findTypeColumnByContents(ws: ExcelJS.Worksheet, layout: Pick<Layout, "headerRow" | "headers" | "map">, numberColumns: number[]): number | undefined {
  const { headerRow, headers, map } = layout;
  if (map.type !== undefined && share(columnValues(ws, headerRow, map.type), isTypeLabel) >= MOSTLY) return undefined;
  let best: { idx: number; score: number } | undefined;
  headers.forEach((_, idx) => {
    if (numberColumns.includes(idx) || idx === map.type) return;
    const score = share(columnValues(ws, headerRow, idx), isTypeLabel);
    if (score >= MOSTLY && score > (best?.score ?? 0)) best = { idx, score };
  });
  return best?.idx;
}

function readLayout(ws: ExcelJS.Worksheet): Layout {
  const headerRow = findHeaderRow(ws);
  const headers = readHeaders(ws, headerRow);
  const map = mapHeaders(headers);
  const byContents = new Set<Field>();

  const number = findNumberColumns(ws, { headerRow, headers });
  if (number.columns.length) map.number = number.columns[0];
  else delete map.number;
  if (number.byContents) byContents.add("number");
  // Whichever column the name-matching gave a claim on, it can't be the number column as well.
  for (const field of ["status", "createdAt", "type"] as const) {
    if (map[field] !== undefined && number.columns.includes(map[field]!)) delete map[field];
  }

  const type = findTypeColumnByContents(ws, { headerRow, headers, map }, number.columns);
  if (type !== undefined) {
    map.type = type;
    byContents.add("type");
  }

  return {
    ws,
    headerRow,
    headers,
    map,
    numberColumns: number.columns,
    byContents,
    missing: REQUIRED.filter((f) => map[f] === undefined),
  };
}

function missingColumnError(layout: Layout): Error {
  const required = layout.missing[0]!;
  return new Error(
    `Sheet "${layout.ws.name}" has no column for "${required}". Expected one of: ${HEADER_ALIASES[required].join(", ")}`,
  );
}

/**
 * The configured sheet if there is one. Otherwise every visible sheet that holds
 * tickets, since trackers may split incidents and SRs, ignoring archives and copies.
 */
function chooseSheets(wb: ExcelJS.Workbook, sheetName: string): { layouts: Layout[]; skipped: SourceReading["skippedSheets"] } {
  const configured = wb.getWorksheet(sheetName);
  if (configured) {
    const layout = readLayout(configured);
    if (layout.missing.length) throw missingColumnError(layout);
    return { layouts: [layout], skipped: [] };
  }

  const visible = wb.worksheets.filter((ws) => ws.state === "visible");
  const all = (visible.length ? visible : wb.worksheets).map(readLayout);
  const usable = all.filter((l) => !l.missing.length);
  if (!usable.length) throw missingColumnError([...all].sort((a, b) => a.missing.length - b.missing.length)[0]!);

  const live = usable.filter((l) => !NOT_LIVE_SHEET.test(l.ws.name));
  const layouts = live.length ? live : usable;
  const skipped = all
    .filter((l) => !layouts.includes(l))
    .map((l) => ({
      name: l.ws.name,
      reason: l.missing.length ? `no ${l.missing[0]} column` : "looks like an archive or copy",
    }));
  return { layouts, skipped };
}

export class ExcelSource implements TicketSource {
  readonly name = "excel" as const;
  constructor(
    private filePath: string,
    private sheetName: string,
    /** How to read a bare number in the time-per-task column. */
    private timeUnit: DurationUnit = "hours",
  ) {}

  async fetchTickets(): Promise<SourceResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(this.filePath));
    if (!wb.worksheets.length) throw new Error(`No worksheet found in ${this.filePath}`);

    const { layouts, skipped } = chooseSheets(wb, this.sheetName);
    const tickets: Ticket[] = [];
    const rejected: SourceResult["rejected"] = [];
    const seen = new Set<string>();
    const reading: SourceReading = {
      sheets: [],
      skippedSheets: skipped,
      typedBy: { column: 0, number: 0, sheet: 0 },
      typeConflicts: [],
    };

    for (const layout of layouts) {
      const { ws, headerRow, headers, map, numberColumns, byContents } = layout;
      const sheetType = typeFromText(ws.name);
      let count = 0;

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRow) return;
        const get = (f: Field) => {
          if (f === "number") {
            for (const idx of numberColumns) {
              const v = cellValue(row.getCell(idx + 1));
              if (v != null && String(v).trim()) return v;
            }
            return null;
          }
          const idx = map[f];
          return idx === undefined ? null : cellValue(row.getCell(idx + 1));
        };
        const label = layouts.length > 1 ? `"${ws.name}" row ${rowNumber}` : `row ${rowNumber}`;
        const { ticket, reason, decision } = rowToTicket(get, label, this.timeUnit, sheetType);
        if (!ticket) return rejected.push({ row: label, reason: reason! });
        if (seen.has(ticket.number)) return rejected.push({ row: label, reason: `duplicate ${ticket.number}` });
        seen.add(ticket.number);
        tickets.push(ticket);
        count++;
        if (decision?.by) reading.typedBy[decision.by]++;
        if (decision?.conflict) {
          reading.typeConflicts.push({ number: ticket.number, column: ticket.type, prefix: ticket.type === "SR" ? "INCIDENT" : "SR" });
        }
      });

      const usedColumns = new Set([...Object.values(map), ...numberColumns]);
      reading.sheets.push({
        name: ws.name,
        headerRow,
        tickets: count,
        columns: (["number", "type", "status", "createdAt"] as const).flatMap((field) => {
          const idx = map[field];
          if (idx === undefined) return [];
          return [{ field, header: headers[idx] ?? "", how: byContents.has(field) ? ("contents" as const) : ("name" as const) }];
        }),
        ignoredHeaders: headers.filter((h, idx) => h.trim() && !usedColumns.has(idx)),
      });
    }

    return { tickets, rejected, reading };
  }
}
