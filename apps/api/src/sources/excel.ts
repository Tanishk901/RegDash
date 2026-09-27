import ExcelJS from "exceljs";
import path from "node:path";
import type { Ticket } from "@regdash/shared";
import type { SourceResult, TicketSource } from "./TicketSource";
import {
  inferType,
  normalizeDate,
  normalizePriority,
  normalizeStatus,
  normalizeText,
} from "../lib/normalize";

/**
 * Reads the team tracker workbook (a local or OneDrive-synced copy of the
 * SharePoint file). Headers are matched case-insensitively and several common
 * aliases are accepted, so the sheet doesn't need to be restructured.
 *
 * Phase 1.1: replace the local path with a Microsoft Graph download
 * (GET /sites/{site}/drive/items/{id}/content) once Graph access is approved.
 */

type Field =
  | "number" | "type" | "shortDescription" | "description" | "status" | "priority"
  | "assignedTo" | "assignmentGroup" | "pendingOwner" | "blocker" | "nextAction"
  | "requestedBy" | "createdAt" | "updatedAt" | "pendingSince" | "slaDueAt" | "lastUpdateNote";

export const HEADER_ALIASES: Record<Field, string[]> = {
  number: ["number", "ticket", "ticket number", "ticket no", "inc/sr number", "id"],
  type: ["type", "ticket type", "category type"],
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
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  headers.forEach((h, idx) => {
    const key = norm(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
      if (out[field] === undefined && aliases.includes(key)) out[field] = idx;
    }
  });
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
): { ticket?: Ticket; reason?: string } {
  const number = normalizeText(get("number"));
  if (!number) return { reason: "missing ticket number" };
  const type = inferType(number, get("type"));
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
      updates: note ? [{ at: updatedAt, by: assignedTo ?? "Tracker", note }] : [],
      source: "excel",
    },
  };
}

export class ExcelSource implements TicketSource {
  readonly name = "excel" as const;
  constructor(
    private filePath: string,
    private sheetName: string,
  ) {}

  async fetchTickets(): Promise<SourceResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(this.filePath));
    const ws = wb.getWorksheet(this.sheetName) ?? wb.worksheets[0];
    if (!ws) throw new Error(`No worksheet found in ${this.filePath}`);

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cell.text ?? "");
    });
    const map = mapHeaders(headers);
    for (const required of ["number", "status", "createdAt"] as const) {
      if (map[required] === undefined) {
        throw new Error(
          `Sheet "${ws.name}" has no column for "${required}". Expected one of: ${HEADER_ALIASES[required].join(", ")}`,
        );
      }
    }

    const tickets: Ticket[] = [];
    const rejected: SourceResult["rejected"] = [];
    const seen = new Set<string>();

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (f: Field) => {
        const idx = map[f];
        return idx === undefined ? null : cellValue(row.getCell(idx + 1));
      };
      const label = `row ${rowNumber}`;
      const { ticket, reason } = rowToTicket(get, label);
      if (!ticket) return rejected.push({ row: label, reason: reason! });
      if (seen.has(ticket.number)) return rejected.push({ row: label, reason: `duplicate ${ticket.number}` });
      seen.add(ticket.number);
      tickets.push(ticket);
    });

    return { tickets, rejected };
  }
}
