import ExcelJS from "exceljs";
import type { TicketView } from "@regdash/shared";

export interface ExportColumn {
  key: string;
  header: string;
  value: (t: TicketView) => string | number | null;
  width?: number;
}

const round = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

export const ALL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "number", header: "Number", value: (t) => t.number, width: 16 },
  { key: "type", header: "Type", value: (t) => t.type, width: 10 },
  { key: "summary", header: "Summary", value: (t) => t.shortDescription, width: 40 },
  { key: "priority", header: "Priority", value: (t) => t.priority, width: 10 },
  { key: "status", header: "Status", value: (t) => t.status, width: 14 },
  { key: "sla", header: "SLA", value: (t) => t.sla, width: 10 },
  { key: "owner", header: "Owner", value: (t) => t.assignedTo, width: 18 },
  { key: "group", header: "Assignment group", value: (t) => t.assignmentGroup, width: 20 },
  { key: "pendingOn", header: "Pending on", value: (t) => t.pendingOwner, width: 18 },
  { key: "blocker", header: "Blocker", value: (t) => t.blocker, width: 30 },
  { key: "nextAction", header: "Next action", value: (t) => t.nextAction, width: 30 },
  { key: "requestedBy", header: "Requested by", value: (t) => t.requestedBy, width: 18 },
  { key: "created", header: "Created", value: (t) => t.createdAt, width: 20 },
  { key: "updated", header: "Last updated", value: (t) => t.updatedAt, width: 20 },
  { key: "pendingSince", header: "Pending since", value: (t) => t.pendingSince, width: 20 },
  { key: "slaDue", header: "SLA due", value: (t) => t.slaDueAt, width: 20 },
  { key: "ageH", header: "Age (h)", value: (t) => round(t.ageHours), width: 10 },
  { key: "hoursSinceUpdate", header: "Hours since update", value: (t) => round(t.hoursSinceUpdate), width: 16 },
  { key: "stale", header: "Stale", value: (t) => (t.stale ? "yes" : "no"), width: 8 },
  { key: "application", header: "Application", value: (t) => t.application, width: 14 },
  { key: "environment", header: "Environment", value: (t) => t.environment, width: 12 },
  { key: "responseSla", header: "Response SLA", value: (t) => t.responseSla?.state ?? null, width: 14 },
  { key: "resolutionSla", header: "Resolution SLA", value: (t) => t.resolutionSla?.state ?? null, width: 14 },
  { key: "taskHours", header: "Time per task (h)", value: (t) => round(t.taskHours), width: 16 },
  { key: "items", header: "Items", value: (t) => t.itemCount, width: 8 },
  { key: "estimatedH", header: "Estimated total (h)", value: (t) => round(t.estimatedHours), width: 16 },
];

export const DEFAULT_EXPORT_KEYS = ALL_EXPORT_COLUMNS.map((c) => c.key);

export async function ticketsToXlsx(items: TicketView[], columnKeys?: string[]): Promise<Buffer> {
  const cols = columnKeys?.length
    ? columnKeys.map((k) => ALL_EXPORT_COLUMNS.find((c) => c.key === k)).filter((c): c is ExportColumn => !!c)
    : ALL_EXPORT_COLUMNS;

  const wb = new ExcelJS.Workbook();
  wb.creator = "RegDash";
  wb.created = new Date();
  const ws = wb.addWorksheet("Tickets");

  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }));

  // Header style
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFFC" } };

  for (const ticket of items) {
    const row: Record<string, string | number | null> = {};
    for (const c of cols) row[c.key] = c.value(ticket);
    ws.addRow(row);
  }

  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + cols.length)}1` };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
