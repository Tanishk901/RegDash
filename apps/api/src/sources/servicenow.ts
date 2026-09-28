import type { Ticket, TicketType } from "@regdash/shared";
import type { SourceResult, TicketSource } from "./TicketSource";
import {
  extractTagged,
  normalizeDate,
  normalizePriority,
  normalizeStatus,
  normalizeText,
} from "../lib/normalize";

/**
 * Reads open incidents and requested items through the ServiceNow Table API.
 *
 *   GET {base}/api/now/table/incident?sysparm_query=active=true^assignment_group.name=...
 *   GET {base}/api/now/table/sc_req_item?sysparm_query=active=true^assignment_group.name=...
 *
 * Needs a service account with read on `incident` and `sc_req_item`.
 * NOT yet tested against a live instance — field names below are the
 * out-of-the-box ones; check them against your instance before relying on it.
 *
 * ServiceNow has no native "next action" or "blocker" field, so Phase 1 uses a
 * work-note convention ("Next: ...", "Blocker: ...", "Pending: ..."). See docs/PHASE-1.md.
 */

type SnField = { value: string; display_value: string };
export type SnRecord = Record<string, SnField | undefined>;

export const FIELDS = [
  "number", "short_description", "description", "state", "priority",
  "assigned_to", "assignment_group", "opened_by", "caller_id", "requested_for",
  "opened_at", "sys_updated_on", "hold_reason", "due_date", "comments_and_work_notes",
].join(",");

const PAGE_SIZE = 500;

export interface ServiceNowOptions {
  baseUrl: string;
  username: string;
  password: string;
  assignmentGroup?: string;
  fetchImpl?: typeof fetch;
}

const d = (r: SnRecord, f: string) => r[f]?.display_value ?? null;
const v = (r: SnRecord, f: string) => r[f]?.value ?? null;

/** Journal display text looks like "2026-09-26 10:02:11 - Priya Nair (Work notes)\nNext: ...". */
function parseJournal(text: string | null): Ticket["updates"] {
  if (!text) return [];
  const entries = text.split(/\n(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - )/);
  return entries
    .map((e) => {
      const m = e.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+?)(?: \((?:Work notes|Additional comments)\))?\n([\s\S]*)$/);
      if (!m) return null;
      return { at: normalizeDate(m[1]) ?? m[1]!, by: m[2]!.trim(), note: m[3]!.trim() };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function mapRecord(r: SnRecord, type: TicketType): { ticket?: Ticket; reason?: string } {
  const number = v(r, "number");
  if (!number) return { reason: "record without number" };
  const status = normalizeStatus(d(r, "state"));
  if (!status) return { reason: `${number}: unknown state "${d(r, "state")}"` };
  const createdAt = normalizeDate(v(r, "opened_at"));
  if (!createdAt) return { reason: `${number}: missing opened_at` };

  const updates = parseJournal(d(r, "comments_and_work_notes"));
  // newest first in ServiceNow journals — take the newest note carrying each tag
  const firstTagged = (tag: "next" | "blocker" | "pending") => {
    for (const u of updates) {
      const hit = extractTagged(u.note, tag);
      if (hit) return hit;
    }
    return null;
  };

  const holdReason = normalizeText(d(r, "hold_reason"));
  const onHold = status === "ON_HOLD";

  return {
    ticket: {
      number,
      type,
      shortDescription: normalizeText(d(r, "short_description")) ?? "(no description)",
      description: normalizeText(d(r, "description")) ?? undefined,
      status,
      priority: normalizePriority(d(r, "priority")) ?? "P3",
      assignedTo: normalizeText(d(r, "assigned_to")),
      assignmentGroup: normalizeText(d(r, "assignment_group")),
      pendingOwner: onHold ? (firstTagged("pending") ?? holdReason) : null,
      blocker: onHold ? (firstTagged("blocker") ?? holdReason) : null,
      nextAction: firstTagged("next"),
      requestedBy: normalizeText(d(r, "caller_id") ?? d(r, "requested_for") ?? d(r, "opened_by")),
      createdAt,
      updatedAt: normalizeDate(v(r, "sys_updated_on")) ?? createdAt,
      pendingSince: null, // needs sys_audit history — Phase 1.1
      slaDueAt: normalizeDate(v(r, "due_date")),
      // Hand-entered in the Excel tracker only; no known ServiceNow field holds these.
      taskHours: null,
      itemCount: null,
      updates: updates.reverse(), // oldest → newest for the timeline
      source: "servicenow",
    },
  };
}

export class ServiceNowSource implements TicketSource {
  readonly name = "servicenow" as const;
  private fetchImpl: typeof fetch;
  constructor(private opts: ServiceNowOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async fetchTable(table: string): Promise<SnRecord[]> {
    const query = ["active=true"];
    if (this.opts.assignmentGroup) query.push(`assignment_group.name=${this.opts.assignmentGroup}`);
    const auth = Buffer.from(`${this.opts.username}:${this.opts.password}`).toString("base64");
    const all: SnRecord[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const url = new URL(`/api/now/table/${table}`, this.opts.baseUrl);
      url.searchParams.set("sysparm_query", query.join("^"));
      url.searchParams.set("sysparm_fields", FIELDS);
      url.searchParams.set("sysparm_display_value", "all");
      url.searchParams.set("sysparm_exclude_reference_link", "true");
      url.searchParams.set("sysparm_limit", String(PAGE_SIZE));
      url.searchParams.set("sysparm_offset", String(offset));

      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`ServiceNow ${table}: HTTP ${res.status} ${res.statusText}`);
      const body = (await res.json()) as { result: SnRecord[] };
      all.push(...body.result);
      if (body.result.length < PAGE_SIZE) break;
    }
    return all;
  }

  async fetchTickets(): Promise<SourceResult> {
    const [incidents, ritms] = await Promise.all([
      this.fetchTable("incident"),
      this.fetchTable("sc_req_item"),
    ]);
    const tickets: Ticket[] = [];
    const rejected: SourceResult["rejected"] = [];
    for (const [rows, type] of [[incidents, "INCIDENT"], [ritms, "SR"]] as const) {
      for (const r of rows) {
        const { ticket, reason } = mapRecord(r, type);
        if (ticket) tickets.push(ticket);
        else rejected.push({ row: v(r, "number") ?? "?", reason: reason! });
      }
    }
    return { tickets, rejected };
  }
}
