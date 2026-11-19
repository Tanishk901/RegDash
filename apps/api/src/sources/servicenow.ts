import type { CommentKind, SlaState, TaskSlaRecord, Ticket, TicketStatus, TicketType } from "@regdash/shared";
import type { SourceResult, TicketSource, WritableTicketSource } from "./TicketSource";
import {
  extractTagged,
  normalizeApplication,
  normalizeDate,
  normalizeEnvironment,
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
  "sys_id", "number", "short_description", "description", "state", "priority",
  "assigned_to", "assignment_group", "opened_by", "caller_id", "requested_for",
  "opened_at", "sys_updated_on", "hold_reason", "due_date", "comments_and_work_notes",
  "cmdb_ci", "service_offering",
].join(",");

const PAGE_SIZE = 500;

const SN_STATE_MAP: Record<string, Partial<Record<TicketStatus, string>>> = {
  incident: { NEW: "1", IN_PROGRESS: "2", ON_HOLD: "3", RESOLVED: "6", CLOSED: "7" },
  sc_req_item: { NEW: "1", IN_PROGRESS: "2", ON_HOLD: "3", RESOLVED: "4", CLOSED: "7" },
};

export interface ServiceNowOptions {
  baseUrl: string;
  username: string;
  password: string;
  assignmentGroup?: string;
  teamMembers?: string[];
  fetchImpl?: typeof fetch;
}

const d = (r: SnRecord, f: string) => r[f]?.display_value ?? null;
const v = (r: SnRecord, f: string) => r[f]?.value ?? null;

function mapSlaKind(slaName: string): "response" | "resolution" | null {
  const lower = slaName.toLowerCase();
  if (lower.includes("response")) return "response";
  if (lower.includes("resolution")) return "resolution";
  return null;
}

function mapSlaStage(stage: string): SlaState | null {
  switch (stage.toLowerCase()) {
    case "in_progress": return "OK";
    case "paused": return "PAUSED";
    case "breached": return "BREACHED";
    default: return null;
  }
}

function parseDurationHours(duration: string | null): number {
  if (!duration) return 0;
  const epoch = new Date("1970-01-01T00:00:00Z").getTime();
  const ts = new Date(duration.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, (ts - epoch) / (60 * 60 * 1000));
}

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
      pendingSince: null, // enriched from sys_audit in fetchTickets()
      slaDueAt: normalizeDate(v(r, "due_date")),
      // Hand-entered in the Excel tracker only; no known ServiceNow field holds these.
      taskHours: null,
      itemCount: null,
      updates: updates.reverse(), // oldest → newest for the timeline
      source: "servicenow",
      application: normalizeApplication(d(r, "cmdb_ci")),
      environment: normalizeEnvironment(d(r, "cmdb_ci")),
      configurationItem: normalizeText(d(r, "cmdb_ci")),
      serviceOffering: normalizeText(d(r, "service_offering")),
    },
  };
}

export class ServiceNowSource implements WritableTicketSource {
  readonly name = "servicenow" as const;
  private fetchImpl: typeof fetch;
  private recordIndex = new Map<string, { sysId: string; table: string }>();

  constructor(private opts: ServiceNowOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private lookupRecord(number: string): { sysId: string; table: string } {
    const rec = this.recordIndex.get(number);
    if (!rec) throw new Error(`Ticket ${number} not found in ServiceNow record index`);
    return rec;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const url = new URL(path, this.opts.baseUrl);
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.opts.username}:${this.opts.password}`).toString("base64")}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ServiceNow ${method} ${path}: HTTP ${res.status} ${res.statusText}`);
    return res;
  }

  private async fetchTable(table: string): Promise<SnRecord[]> {
    const query = ["active=true"];
    if (this.opts.assignmentGroup) query.push(`assignment_group.name=${this.opts.assignmentGroup}`);
    const all: SnRecord[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const url = new URL(`/api/now/table/${table}`, this.opts.baseUrl);
      url.searchParams.set("sysparm_query", query.join("^"));
      url.searchParams.set("sysparm_fields", FIELDS);
      url.searchParams.set("sysparm_display_value", "all");
      url.searchParams.set("sysparm_exclude_reference_link", "true");
      url.searchParams.set("sysparm_limit", String(PAGE_SIZE));
      url.searchParams.set("sysparm_offset", String(offset));

      const res = await this.request("GET", url.pathname + url.search);
      const body = (await res.json()) as { result: SnRecord[] };
      all.push(...body.result);
      if (body.result.length < PAGE_SIZE) break;
    }
    return all;
  }

  private async fetchTaskSla(numbers: string[]): Promise<Map<string, TaskSlaRecord[]>> {
    const map = new Map<string, TaskSlaRecord[]>();
    if (numbers.length === 0) return map;
    const url = new URL("/api/now/table/task_sla", this.opts.baseUrl);
    url.searchParams.set("sysparm_query", `task.numberIN${numbers.join(",")}`);
    url.searchParams.set("sysparm_fields", "task.number,sla,stage,business_time_left,planned_end_time");
    url.searchParams.set("sysparm_display_value", "all");
    url.searchParams.set("sysparm_exclude_reference_link", "true");
    url.searchParams.set("sysparm_limit", String(numbers.length * 4));

    const res = await this.request("GET", url.pathname + url.search);
    const body = (await res.json()) as { result: SnRecord[] };

    for (const r of body.result) {
      const number = d(r, "task.number");
      const kind = mapSlaKind(d(r, "sla") ?? "");
      const stage = mapSlaStage(v(r, "stage") ?? "");
      if (!number || !kind || !stage) continue;

      const record: TaskSlaRecord = {
        kind,
        stage,
        businessTimeLeftHours: parseDurationHours(v(r, "business_time_left")),
        plannedEndTime: normalizeDate(v(r, "planned_end_time")),
      };
      const existing = map.get(number);
      if (existing) existing.push(record);
      else map.set(number, [record]);
    }
    return map;
  }

  private async fetchPendingSince(sysIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (sysIds.length === 0) return map;
    const url = new URL("/api/now/table/sys_audit", this.opts.baseUrl);
    url.searchParams.set("sysparm_query",
      `documentkeyIN${sysIds.join(",")}^fieldname=state^newvalue=3^ORDERBYDESCsys_created_on`);
    url.searchParams.set("sysparm_fields", "documentkey,sys_created_on");
    url.searchParams.set("sysparm_limit", String(sysIds.length));

    const res = await this.request("GET", url.pathname + url.search);
    const body = (await res.json()) as { result: SnRecord[] };

    for (const r of body.result) {
      const docKey = v(r, "documentkey");
      const createdOn = normalizeDate(v(r, "sys_created_on"));
      if (docKey && createdOn && !map.has(docKey)) map.set(docKey, createdOn);
    }
    return map;
  }

  async fetchTickets(): Promise<SourceResult> {
    const [incidents, ritms] = await Promise.all([
      this.fetchTable("incident"),
      this.fetchTable("sc_req_item"),
    ]);
    this.recordIndex.clear();
    const tickets: Ticket[] = [];
    const rejected: SourceResult["rejected"] = [];
    for (const [rows, type, table] of [
      [incidents, "INCIDENT", "incident"],
      [ritms, "SR", "sc_req_item"],
    ] as const) {
      for (const r of rows) {
        const { ticket, reason } = mapRecord(r, type);
        if (ticket) {
          tickets.push(ticket);
          const sysId = v(r, "sys_id");
          if (sysId) this.recordIndex.set(ticket.number, { sysId, table });
        } else {
          rejected.push({ row: v(r, "number") ?? "?", reason: reason! });
        }
      }
    }
    const slaMap = await this.fetchTaskSla(tickets.map((t) => t.number));
    for (const ticket of tickets) {
      const records = slaMap.get(ticket.number);
      if (records?.length) ticket.taskSlaRecords = records;
    }

    const onHoldSysIds = tickets
      .filter((t) => t.status === "ON_HOLD")
      .map((t) => this.recordIndex.get(t.number)?.sysId)
      .filter((id): id is string => !!id);
    if (onHoldSysIds.length > 0) {
      const pendingMap = await this.fetchPendingSince(onHoldSysIds);
      for (const ticket of tickets) {
        if (ticket.status !== "ON_HOLD") continue;
        const rec = this.recordIndex.get(ticket.number);
        if (rec) ticket.pendingSince = pendingMap.get(rec.sysId) ?? null;
      }
    }

    return { tickets, rejected };
  }

  async addComment(number: string, note: string, _by: string, kind: CommentKind = "work_note"): Promise<void> {
    const { sysId, table } = this.lookupRecord(number);
    const field = kind === "customer_comment" ? "comments" : "work_notes";
    await this.request("PATCH", `/api/now/table/${table}/${sysId}`, { [field]: note });
  }

  async updateAssignment(number: string, assignedTo: string | null): Promise<void> {
    const { sysId, table } = this.lookupRecord(number);
    const url = `/api/now/table/${table}/${sysId}?sysparm_input_display_value=true`;
    await this.request("PATCH", url, { assigned_to: assignedTo ?? "" });
  }

  async updateStatus(number: string, status: TicketStatus, _by: string): Promise<void> {
    const { sysId, table } = this.lookupRecord(number);
    const stateValue = SN_STATE_MAP[table]?.[status];
    if (!stateValue) throw new Error(`No ServiceNow state mapping for ${status} on table ${table}`);
    await this.request("PATCH", `/api/now/table/${table}/${sysId}`, { state: stateValue });
  }

  teamMembers(): string[] {
    return this.opts.teamMembers ?? [];
  }
}
