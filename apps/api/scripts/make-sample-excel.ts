/**
 * Writes data/sample-tickets.xlsx from the mock generator, in the same messy
 * shape a real team tracker tends to have (human-readable statuses,
 * "1 - Critical" priorities, dd/mm/yyyy dates). Use it to test DATA_SOURCE=excel
 * and as a template for the real SharePoint sheet's columns.
 *
 *   pnpm sample:excel
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMockTickets } from "../src/sources/mock";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../data/sample-tickets.xlsx");

const STATUS_LABEL = { NEW: "New", IN_PROGRESS: "In Progress", ON_HOLD: "On Hold - Awaiting", RESOLVED: "Resolved", CLOSED: "Closed" };
const PRIORITY_LABEL = { P1: "1 - Critical", P2: "2 - High", P3: "3 - Moderate", P4: "4 - Low" };
const dmy = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Tickets");
ws.columns = [
  { header: "Number", key: "number", width: 14 },
  { header: "Type", key: "type", width: 10 },
  { header: "Short Description", key: "sd", width: 50 },
  { header: "Status", key: "status", width: 20 },
  { header: "Priority", key: "priority", width: 14 },
  { header: "Assigned To", key: "assignedTo", width: 16 },
  { header: "Assignment Group", key: "group", width: 18 },
  { header: "Pending Owner", key: "pendingOwner", width: 20 },
  { header: "Blocker", key: "blocker", width: 40 },
  { header: "Next Action", key: "nextAction", width: 45 },
  { header: "Requested By", key: "requestedBy", width: 14 },
  { header: "Created", key: "created", width: 17 },
  { header: "Last Updated", key: "updated", width: 17 },
  { header: "Pending Since", key: "pendingSince", width: 17 },
  { header: "SLA Due", key: "slaDue", width: 17 },
  { header: "Latest Update", key: "note", width: 50 },
];
ws.getRow(1).font = { bold: true };
ws.views = [{ state: "frozen", ySplit: 1 }];

for (const t of generateMockTickets()) {
  ws.addRow({
    number: t.number,
    type: t.type === "INCIDENT" ? "Incident" : "SR",
    sd: t.shortDescription,
    status: STATUS_LABEL[t.status],
    priority: PRIORITY_LABEL[t.priority],
    assignedTo: t.assignedTo ?? "",
    group: t.assignmentGroup ?? "",
    pendingOwner: t.pendingOwner ?? "",
    blocker: t.blocker ?? "",
    nextAction: t.nextAction ?? "",
    requestedBy: t.requestedBy ?? "",
    created: dmy(t.createdAt),
    updated: dmy(t.updatedAt),
    pendingSince: dmy(t.pendingSince),
    slaDue: "",
    note: t.updates.at(-1)?.note ?? "",
  });
}

await wb.xlsx.writeFile(out);
console.log(`Wrote ${out}`);
