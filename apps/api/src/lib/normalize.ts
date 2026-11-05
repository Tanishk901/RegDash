import type { Priority, TicketStatus, TicketType } from "@regdash/shared";

/**
 * Real data is messy: Excel sheets say "WIP", "Awaiting user", "1 - Critical",
 * ServiceNow display values vary by instance. Every source funnels its raw
 * strings through these functions so the rest of the app sees one vocabulary.
 */

const clean = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");

export function normalizeStatus(raw: unknown): TicketStatus | null {
  if (raw == null) return null;
  const s = clean(String(raw));
  if (!s) return null;
  if (/^(new|open|logged|submitted|draft)$/.test(s)) return "NEW";
  if (/(in progress|wip|work in progress|assigned|active|working)/.test(s)) return "IN_PROGRESS";
  if (/(hold|pending|awaiting|waiting|blocked)/.test(s)) return "ON_HOLD";
  if (/(resolved|fixed|completed? pending)/.test(s)) return "RESOLVED";
  if (/(closed|complete|cancel+ed|skipped|done)/.test(s)) return "CLOSED";
  return null;
}

export function normalizePriority(raw: unknown): Priority | null {
  if (raw == null) return null;
  const s = clean(String(raw));
  if (!s) return null;
  // "1", "P1", "1 - Critical", "p1 critical"
  const digit = s.match(/^p?\s*([1-5])\b/);
  if (digit) {
    const n = Number(digit[1]);
    return (n >= 4 ? "P4" : `P${n}`) as Priority;
  }
  if (/critical|urgent|sev ?1/.test(s)) return "P1";
  if (/high|sev ?2/.test(s)) return "P2";
  if (/moderate|medium|normal|sev ?3/.test(s)) return "P3";
  if (/low|planning|sev ?4/.test(s)) return "P4";
  return null;
}

/** Reads a type label. Whole words only, so "Include" or "Srinivas" don't count, and a label naming both is no answer. */
export function typeFromText(raw: unknown): TicketType | null {
  if (raw == null) return null;
  const s = clean(String(raw));
  const incident = /\b(incidents?|inc|outage)\b/.test(s);
  const request = /\b(service req(uest)?s?|srs?|requests?|reqs?|ritms?|sctasks?|tasks?)\b/.test(s);
  if (incident === request) return null;
  return incident ? "INCIDENT" : "SR";
}

/** True when the whole value is a type label, not just text mentioning one such as "Incident Team". */
export function isTypeLabel(raw: unknown): boolean {
  return /^(incidents?|inc|outage|service req(uest)?s?|srs?|requests?|reqs?|ritms?|sctasks?|tasks?)$/.test(clean(String(raw)));
}

/** Reads a ticket number's prefix, which must be followed by digits: "INC0012345", "SR-104", "RITM 77". */
export function typeFromNumber(number: unknown): TicketType | null {
  if (number == null) return null;
  const n = String(number).trim().toUpperCase();
  if (/^INC(IDENT)?[\s_-]*\d/.test(n)) return "INCIDENT";
  if (/^(RITM|REQ|SCTASK|SR)[\s_-]*\d/.test(n)) return "SR";
  return null;
}

export interface TypeDecision {
  type: TicketType | null;
  by: "column" | "number" | "sheet" | null;
  /** The type column and the number prefix disagree. */
  conflict: boolean;
}

/**
 * Decides incident or SR. A type column is what the team wrote, so it wins; the
 * number prefix comes next, then a sheet named for one kind ("Incidents").
 */
export function classifyType(number: unknown, column?: unknown, sheet: TicketType | null = null): TypeDecision {
  const fromColumn = typeFromText(column);
  const fromNumber = typeFromNumber(number);
  if (fromColumn) return { type: fromColumn, by: "column", conflict: fromNumber !== null && fromNumber !== fromColumn };
  if (fromNumber) return { type: fromNumber, by: "number", conflict: false };
  return { type: sheet, by: sheet ? "sheet" : null, conflict: false };
}

/** Accepts Date, ISO strings, "26/09/2026 14:05", "2026-09-26 14:05:00", Excel serials. */
export function normalizeDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString();
  if (typeof raw === "number") {
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(raw).trim();
  // dd/mm/yyyy [hh:mm[:ss]] — the Indian/UK format Excel exports usually use
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // ServiceNow "yyyy-mm-dd hh:mm:ss" (UTC in the API's value field)
  const sn = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  const d = new Date(sn ? `${sn[1]}T${sn[2]}Z` : s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type DurationUnit = "hours" | "minutes";

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const UNIT_HOURS: Record<string, number> = { d: 24, h: 1, m: 1 / 60 };

/**
 * Hand-typed durations → hours. Accepts "2h", "1.5 hrs", "30 min", "1d 4h",
 * "2:30" (h:mm), Excel time cells (Date on the 1899-12-30 epoch) and bare
 * numbers, which are read as `bareUnit` because the tracker doesn't say.
 */
export function normalizeDuration(raw: unknown, bareUnit: DurationUnit = "hours"): number | null {
  if (raw == null || raw === "") return null;
  const bare = (n: number) => (bareUnit === "minutes" ? n / 60 : n);
  if (raw instanceof Date) {
    const h = (raw.getTime() - EXCEL_EPOCH_MS) / 3600_000;
    return isNaN(h) || h < 0 ? null : h;
  }
  if (typeof raw === "number") return raw >= 0 ? bare(raw) : null;
  const s = String(raw).trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return bare(Number(s));
  const hm = s.match(/^(\d+):(\d{2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  let total = 0;
  let found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?)\b/g)) {
    total += Number(m[1]) * UNIT_HOURS[m[2]![0]!]!;
    found = true;
  }
  return found ? total : null;
}

/** "36", 36, "36 items" → 36. Anything without a positive whole number → null. */
export function normalizeCount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const m = String(raw).match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizeText(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

/**
 * Convention for sources with no native "next action"/"blocker" fields
 * (ServiceNow): the team writes work notes like
 *   "Next: waiting for user to confirm role"
 *   "Blocker: vendor ticket #123 open"
 * The newest matching line wins.
 */
export function extractTagged(text: string | null, tag: "next" | "blocker" | "pending"): string | null {
  if (!text) return null;
  const re = new RegExp(`^\\s*${tag}(?: action| owner| on)?\\s*[:\\-]\\s*(.+)$`, "im");
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}
