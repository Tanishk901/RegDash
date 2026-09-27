import type { Ticket } from "@regdash/shared";
import type { SourceResult, TicketSource } from "../sources/TicketSource";

/**
 * In-memory cache of the latest successful pull. If a refresh fails, the
 * dashboard keeps serving the last good data and reports the error in
 * /api/health — a support dashboard that goes blank during an outage is useless.
 */
export class TicketStore {
  private tickets: Ticket[] = [];
  private rejected: SourceResult["rejected"] = [];
  lastRefreshedAt: string | null = null;
  lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(readonly source: TicketSource) {}

  all(): Ticket[] {
    return this.tickets;
  }

  get(number: string): Ticket | undefined {
    const n = number.toUpperCase();
    return this.tickets.find((t) => t.number === n);
  }

  rejectedRows() {
    return this.rejected;
  }

  refresh(): Promise<void> {
    // Collapse concurrent refreshes into one call to the source.
    this.inFlight ??= (async () => {
      try {
        const res = await this.source.fetchTickets();
        this.tickets = res.tickets;
        this.rejected = res.rejected;
        this.lastRefreshedAt = new Date().toISOString();
        this.lastError = null;
        if (res.rejected.length) {
          console.warn(`[store] ${res.rejected.length} row(s) rejected from ${this.source.name}`);
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        console.error(`[store] refresh from ${this.source.name} failed:`, this.lastError);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  startAutoRefresh(seconds: number) {
    this.stop();
    this.timer = setInterval(() => void this.refresh(), seconds * 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
