import type { SourceReading, Ticket } from "@regdash/shared";

/**
 * Every data source implements this. Swapping mock → Excel → ServiceNow is a
 * config change (DATA_SOURCE), not a code change anywhere else.
 */
export interface TicketSource {
  readonly name: Ticket["source"];
  fetchTickets(): Promise<SourceResult>;
}

export interface SourceResult {
  tickets: Ticket[];
  /** Rows the source could not turn into a valid Ticket — surfaced, never silently dropped. */
  rejected: { row: string; reason: string }[];
  /** How a spreadsheet was understood. Only sources that have to guess report this. */
  reading?: SourceReading;
}
