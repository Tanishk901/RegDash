/**
 * The single normalized shape every data source (mock, Excel, ServiceNow)
 * must produce. The UI only ever sees this — never raw ServiceNow/Excel rows.
 */

export type TicketType = "INCIDENT" | "SR";

export type ApplicationCode = "REGCREATE" | "SYMPHONY" | "SONATA" | "GLE" | "CLRR" | "OTHER";
export type Environment = "DEV" | "QA" | "PROD" | "OTHER";

export const APPLICATION_CODES: ApplicationCode[] = ["REGCREATE", "SYMPHONY", "SONATA", "GLE", "CLRR", "OTHER"];
export const ENVIRONMENTS: Environment[] = ["DEV", "QA", "PROD", "OTHER"];

export type TicketStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "ON_HOLD" // waiting on someone else (user, vendor, another team)
  | "RESOLVED"
  | "CLOSED";

/** P1 = critical ... P4 = low (ServiceNow 5 "planning" is folded into P4). */
export type Priority = "P1" | "P2" | "P3" | "P4";

/** PAUSED = ticket is ON_HOLD; the team's SLA clock stops while waiting on others. */
export type SlaState = "OK" | "AT_RISK" | "BREACHED" | "PAUSED";

export type CommentKind = "work_note" | "customer_comment";

export interface TicketUpdate {
  at: string; // ISO timestamp
  by: string;
  note: string;
  kind?: CommentKind;
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

  /** Time one task/item takes, in hours, entered by hand in the tracker. null = not recorded. */
  taskHours: number | null;
  /** How many items the ticket covers (e.g. 36 items to add to prod). null = not recorded. */
  itemCount: number | null;

  updates: TicketUpdate[];
  /** Real SLA records from ServiceNow task_sla; absent for Excel/mock unless generated. */
  taskSlaRecords?: TaskSlaRecord[];
  /** Which source produced this record. */
  source: "mock" | "excel" | "servicenow";

  application: ApplicationCode | null;
  environment: Environment | null;
  configurationItem: string | null;
  serviceOffering: string | null;
}

/** How a spreadsheet was understood, so the assumptions can be checked rather than trusted. */
export interface SourceReading {
  sheets: {
    name: string;
    headerRow: number;
    tickets: number;
    /** The columns that decide what a ticket is. `how` says whether the name or the contents gave it away. */
    columns: { field: "number" | "type" | "status" | "createdAt"; header: string; how: "name" | "contents" }[];
    /** Column names that weren't recognised and so aren't used. */
    ignoredHeaders: string[];
  }[];
  skippedSheets: { name: string; reason: string }[];
  /** How many tickets got their type from each rule, in the order the rules are tried. */
  typedBy: { column: number; number: number; sheet: number };
  /** Tickets whose type column and number prefix disagree. The type column wins. */
  typeConflicts: { number: string; column: TicketType; prefix: TicketType }[];
}

/** A real SLA record from ServiceNow's task_sla table. */
export interface TaskSlaRecord {
  kind: "response" | "resolution";
  stage: SlaState;
  businessTimeLeftHours: number;
  plannedEndTime: string | null;
}

/** Detail for one SLA clock (response or resolution). */
export interface TicketSlaDetail {
  kind: "response" | "resolution";
  state: SlaState;
  targetHours: number | null;
  elapsedHours: number;
  available: boolean;
}

/** Ticket plus fields the API derives at read time. */
export interface TicketView extends Ticket {
  ageHours: number;
  hoursSinceUpdate: number;
  sla: SlaState;
  responseSla: TicketSlaDetail | null;
  resolutionSla: TicketSlaDetail | null;
  /** true when no update in STALE_AFTER_HOURS */
  stale: boolean;
  /** Hours in the current pending state; null unless ON_HOLD with a known pendingSince. */
  pendingHours: number | null;
  /** taskHours × itemCount; null unless both are recorded. */
  estimatedHours: number | null;
}

/** One row of the team workload view: an owner's open tickets. */
export interface OwnerWorkload {
  owner: string;
  /** Open tickets. */
  count: number;
  byPriority: Record<Priority, number>;
  breached: number;
  atRisk: number;
  onHold: number;
  stale: number;
  actionable: number;
  /** Sum of estimatedHours over open tickets that have one. */
  estimatedHours: number;
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
  application?: ApplicationCode;
  environment?: Environment;
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
  byOwner: OwnerWorkload[];
  byApplication: Record<ApplicationCode, number>;
  byEnvironment: Record<Environment, number>;
  lastRefreshedAt: string | null;
  source: Ticket["source"];
}

export const OPEN_STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "ON_HOLD"];
export const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];
export const STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];

export type GroupByField = "assignedTo" | "priority" | "status" | "type" | "sla" | "application" | "environment";
export const GROUP_BY_FIELDS: GroupByField[] = ["assignedTo", "priority", "status", "type", "sla", "application", "environment"];

export interface SavedView {
  id: string;
  name: string;
  description: string;
  columns: string[];
  filters: TicketFilters;
  sort: SortKey;
  sortDir: "asc" | "desc";
  groupBy: GroupByField | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SavedViewInput = Omit<SavedView, "id" | "createdAt" | "updatedAt">;
