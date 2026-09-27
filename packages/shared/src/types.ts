/**
 * The single normalized shape every data source (mock, Excel, ServiceNow)
 * must produce. The UI only ever sees this — never raw ServiceNow/Excel rows.
 */

export type TicketType = "INCIDENT" | "SR";

export type TicketStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "ON_HOLD" // waiting on someone else (user, vendor, another team)
  | "RESOLVED"
  | "CLOSED";

/** P1 = critical ... P4 = low (ServiceNow 5 "planning" is folded into P4). */
export type Priority = "P1" | "P2" | "P3" | "P4";

export type SlaState = "OK" | "AT_RISK" | "BREACHED";

export interface TicketUpdate {
  at: string; // ISO timestamp
  by: string;
  note: string;
}

export interface Ticket {
  /** ServiceNow number, e.g. INC0012345 / RITM0004567 — also the stable id. */
  number: string;
  type: TicketType;
  shortDescription: string;
  description?: string;
  status: TicketStatus;
  priority: Priority;

  /** Person currently working the ticket. */
  assignedTo: string | null;
  assignmentGroup: string | null;
  /** Who the ticket is waiting on right now (user, vendor, team). null = not blocked. */
  pendingOwner: string | null;
  /** Why it's blocked, in plain words. */
  blocker: string | null;
  /** The next concrete step to move the ticket forward. */
  nextAction: string | null;

  requestedBy: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** When the ticket entered its current pending state, if known. */
  pendingSince: string | null;
  /** SLA due date if the source provides one; otherwise computed from priority. */
  slaDueAt: string | null;

  updates: TicketUpdate[];
  /** Which source produced this record. */
  source: "mock" | "excel" | "servicenow";
}

/** Ticket plus fields the API derives at read time. */
export interface TicketView extends Ticket {
  ageHours: number;
  hoursSinceUpdate: number;
  sla: SlaState;
  /** true when no update in STALE_AFTER_HOURS */
  stale: boolean;
}

export interface TicketFilters {
  type?: TicketType;
  status?: TicketStatus[];
  priority?: Priority[];
  assignedTo?: string;
  sla?: SlaState;
  stale?: boolean;
  q?: string; // free text over number / description / owner
  includeClosed?: boolean;
}

export type SortKey = "priority" | "age" | "updated" | "sla";

export interface DashboardSummary {
  totalOpen: number;
  incidentsOpen: number;
  srsOpen: number;
  byPriority: Record<Priority, number>;
  byStatus: Record<TicketStatus, number>;
  slaBreached: number;
  slaAtRisk: number;
  stale: number;
  onHold: number;
  byOwner: { owner: string; count: number }[];
  lastRefreshedAt: string | null;
  source: Ticket["source"];
}

export const OPEN_STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "ON_HOLD"];
export const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];
export const STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];
