import type { TicketView } from "@regdash/shared";

const round = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

const COLUMNS: [header: string, value: (t: TicketView) => string | number | null][] = [
  ["Number", (t) => t.number],
  ["Type", (t) => t.type],
  ["Summary", (t) => t.shortDescription],
  ["Priority", (t) => t.priority],
  ["Status", (t) => t.status],
  ["SLA", (t) => t.sla],
  ["Owner", (t) => t.assignedTo],
  ["Assignment group", (t) => t.assignmentGroup],
  ["Pending on", (t) => t.pendingOwner],
  ["Blocker", (t) => t.blocker],
  ["Next action", (t) => t.nextAction],
  ["Requested by", (t) => t.requestedBy],
  ["Created", (t) => t.createdAt],
  ["Last updated", (t) => t.updatedAt],
  ["Pending since", (t) => t.pendingSince],
  ["SLA due", (t) => t.slaDueAt],
  ["Age (h)", (t) => round(t.ageHours)],
  ["Hours since update", (t) => round(t.hoursSinceUpdate)],
  ["Stale", (t) => (t.stale ? "yes" : "no")],
  ["Time per task (h)", (t) => round(t.taskHours)],
  ["Items", (t) => t.itemCount],
  ["Estimated total (h)", (t) => round(t.estimatedHours)],
];

function cell(v: string | number | null): string {
  if (v == null) return "";
  let s = String(v);
  // Stop Excel from running a cell as a formula (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ticketsToCsv(items: TicketView[]): string {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(",")];
  for (const t of items) lines.push(COLUMNS.map(([, get]) => cell(get(t))).join(","));
  // BOM so Excel opens UTF-8 names (e.g. "Müller") correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
