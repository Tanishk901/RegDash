import type { SourceReading, Ticket, TicketStatus } from "@regdash/shared";

/**
 * Every data source implements this. Swapping mock → Excel → ServiceNow is a
 * config change (DATA_SOURCE), not a code change anywhere else.
 */
export interface TicketSource {
  readonly name: Ticket["source"];
  fetchTickets(): Promise<SourceResult>;
}

/** Sources that support writing back (mock, ServiceNow). Excel is read-only. */
export interface WritableTicketSource extends TicketSource {
  addComment(number: string, note: string, by: string): Promise<void>;
  updateAssignment(number: string, assignedTo: string | null): Promise<void>;
  updateStatus(number: string, status: TicketStatus, by: string): Promise<void>;
  teamMembers(): string[];
}

export function isWritable(source: TicketSource): source is WritableTicketSource {
  return "addComment" in source && typeof (source as WritableTicketSource).addComment === "function";
}

export interface SourceResult {
  tickets: Ticket[];
  /** Rows the source could not turn into a valid Ticket — surfaced, never silently dropped. */
  rejected: { row: string; reason: string }[];
  /** How a spreadsheet was understood. Only sources that have to guess report this. */
  reading?: SourceReading;
}
