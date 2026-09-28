import { DEFAULT_SLA_HOURS } from "@regdash/shared";
import type { Priority, Ticket, TicketStatus, TicketType, TicketUpdate } from "@regdash/shared";
import type { SourceResult, TicketSource } from "./TicketSource";

/**
 * Realistic fake RegCreate tickets. Deterministic (seeded) so screenshots and
 * tests are repeatable; timestamps are relative to "now" so SLA states vary.
 * Contains NO real company data — safe to run on a personal machine.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENGINEERS = ["Aarav Shah", "Priya Nair", "Rohan Mehta", "Sneha Iyer", "Karan Verma", null];
const GROUP = "RegCreate Support";
const REQUESTERS = ["J. Thomas", "M. Garcia", "L. Chen", "A. Kowalski", "S. Patel", "R. Okafor", "E. Müller"];

const INCIDENTS: { title: string; blocker?: string; pending?: string; next: string }[] = [
  { title: "User unable to log in to RegCreate after provisioning", next: "Verify role mapping in access matrix" },
  { title: "Submission stuck in 'Pending Validation' state", blocker: "Awaiting DB team to check job queue", pending: "DB Team", next: "Follow up with DB team on job logs" },
  { title: "PDF rendition failing for large dossiers", next: "Reproduce with 200MB sample and capture logs" },
  { title: "RegCreate page load > 30s for EU users", blocker: "Network trace requested from user", pending: "Requester", next: "Analyse HAR file once received" },
  { title: "Metadata sync job failed overnight", next: "Re-run sync job and confirm record counts" },
  { title: "Search returns no results for recent documents", next: "Check indexer lag and reindex affected range" },
  { title: "Error 500 when exporting submission report", next: "Check API logs for stack trace" },
  { title: "Workflow approval emails not being delivered", blocker: "Mail relay issue raised with messaging team", pending: "Messaging Team", next: "Confirm relay fix, then resend pending notifications" },
  { title: "Duplicate records created on bulk upload", next: "Identify duplicates and share cleanup script for approval" },
  { title: "User sees another region's documents", next: "Audit ACL for user's group — treat as priority" },
  { title: "Attachment upload times out at 50MB", blocker: "Vendor ticket open for gateway limit", pending: "Vendor", next: "Chase vendor for ETA" },
  { title: "Session expires every 5 minutes", next: "Compare SSO token lifetime config across environments" },
];

const SRS: { title: string; blocker?: string; pending?: string; next: string }[] = [
  { title: "New user access — RegCreate Author role", next: "Create account and send welcome mail" },
  { title: "Role change: Reviewer → Approver", blocker: "Manager approval not yet received", pending: "Requester's Manager", next: "Send approval reminder" },
  { title: "Access removal for leaver", next: "Disable account and confirm to requester" },
  { title: "Bulk access for 12 new team members", blocker: "Missing cost-centre details", pending: "Requester", next: "Collect cost-centre, then batch provision" },
  { title: "Create new product folder structure", next: "Confirm naming convention with requester" },
  { title: "Data extract for audit — Q3 submissions", next: "Run extract query and validate row counts" },
  { title: "Add new country to region picklist", blocker: "Change request pending CAB", pending: "Change Advisory Board", next: "Present at Thursday CAB" },
  { title: "Reset MFA for user", next: "Verify identity and reset" },
  { title: "Enable read-only access for external auditor", blocker: "Security review in progress", pending: "InfoSec", next: "Share access scope doc with InfoSec" },
  { title: "Update email distribution list for alerts", next: "Apply change and send test alert" },
];

const HOUR = 3600_000;

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function weightedPriority(rand: () => number): Priority {
  const r = rand();
  return r < 0.08 ? "P1" : r < 0.3 ? "P2" : r < 0.75 ? "P3" : "P4";
}

function weightedStatus(rand: () => number, hasBlocker: boolean): TicketStatus {
  if (hasBlocker) return "ON_HOLD";
  const r = rand();
  return r < 0.2 ? "NEW" : r < 0.8 ? "IN_PROGRESS" : r < 0.9 ? "RESOLVED" : "CLOSED";
}

export function generateMockTickets(count = 42, seed = 20260927, now = new Date()): Ticket[] {
  const rand = mulberry32(seed);
  const tickets: Ticket[] = [];
  let incNo = 12001;
  let ritmNo = 4501;

  for (let i = 0; i < count; i++) {
    const type: TicketType = rand() < 0.55 ? "INCIDENT" : "SR";
    const tpl = pick(rand, type === "INCIDENT" ? INCIDENTS : SRS);
    const priority = weightedPriority(rand);
    const status = weightedStatus(rand, !!tpl.blocker && rand() < 0.85);
    const assignedTo = status === "NEW" && rand() < 0.5 ? null : pick(rand, ENGINEERS);

    // ~20% past their SLA window, the rest spread across it — a realistic mix for a demo.
    const slaHours = DEFAULT_SLA_HOURS[priority];
    const ageHours = 0.5 + slaHours * (rand() < 0.2 ? 1 + rand() * 0.8 : 0.05 + rand() * 0.85);
    const createdAt = new Date(now.getTime() - ageHours * HOUR);
    const sinceUpdate = rand() * Math.min(ageHours, rand() < 0.2 ? 120 : 30);
    const updatedAt = new Date(now.getTime() - sinceUpdate * HOUR);

    const updates: TicketUpdate[] = [
      { at: createdAt.toISOString(), by: "System", note: "Ticket created from RegCreate shared mailbox." },
    ];
    if (assignedTo) {
      updates.push({
        at: new Date(createdAt.getTime() + (updatedAt.getTime() - createdAt.getTime()) * 0.3).toISOString(),
        by: assignedTo,
        note: "Picked up. Investigating.",
      });
    }
    if (tpl.blocker && status === "ON_HOLD") {
      updates.push({ at: updatedAt.toISOString(), by: assignedTo ?? "Support", note: `Blocker: ${tpl.blocker}` });
    } else if (updates.length > 1) {
      updates.push({ at: updatedAt.toISOString(), by: assignedTo ?? "Support", note: `Next: ${tpl.next}` });
    }

    const onHold = status === "ON_HOLD";
    // Most tickets get a time-per-task estimate; about half also cover several items.
    const taskHours = rand() < 0.8 ? pick(rand, [0.25, 0.5, 1, 2, 4] as const) : null;
    const itemCount = rand() < 0.5 ? pick(rand, [1, 5, 12, 36] as const) : null;
    tickets.push({
      number: type === "INCIDENT" ? `INC00${incNo++}` : `RITM000${ritmNo++}`,
      type,
      shortDescription: tpl.title,
      description: `${tpl.title}.\n\nReported by requester via the RegCreate shared mailbox. (Mock data.)`,
      status,
      priority,
      assignedTo,
      assignmentGroup: GROUP,
      pendingOwner: onHold ? (tpl.pending ?? "Requester") : null,
      blocker: onHold ? (tpl.blocker ?? null) : null,
      nextAction: status === "RESOLVED" || status === "CLOSED" ? null : tpl.next,
      requestedBy: pick(rand, REQUESTERS),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      pendingSince: onHold ? updatedAt.toISOString() : null,
      slaDueAt: null,
      taskHours,
      itemCount,
      updates,
      source: "mock",
    });
  }
  return tickets;
}

export class MockSource implements TicketSource {
  readonly name = "mock" as const;
  async fetchTickets(): Promise<SourceResult> {
    return { tickets: generateMockTickets(), rejected: [] };
  }
}
