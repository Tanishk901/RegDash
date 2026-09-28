import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardSummary, TicketView } from "@regdash/shared";

export interface TicketList {
  items: TicketView[];
  total: number;
  owners: string[];
}

export interface Health {
  ok: boolean;
  source: string;
  tickets: number;
  lastRefreshedAt: string | null;
  lastError: string | null;
  rejectedRows: { row: string; reason: string }[];
  /** Set when SERVICENOW_BASE_URL is configured; enables "Open in ServiceNow" links. */
  servicenowUrl: string | null;
}

const SN_TABLE_BY_PREFIX: [prefix: string, table: string][] = [
  ["INC", "incident"],
  ["RITM", "sc_req_item"],
  ["REQ", "sc_request"],
  ["SCTASK", "sc_task"],
];

/** Link that opens a ticket in ServiceNow by its number, or null if the number's table is unknown. */
export function serviceNowLink(baseUrl: string, number: string): string | null {
  const table = SN_TABLE_BY_PREFIX.find(([p]) => number.toUpperCase().startsWith(p))?.[1];
  if (!table) return null;
  const target = `${table}.do?sysparm_query=number=${number}`;
  return `${baseUrl.replace(/\/+$/, "")}/nav_to.do?uri=${encodeURIComponent(target)}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => get<DashboardSummary>("/api/summary"),
  tickets: (params: URLSearchParams) => get<TicketList>(`/api/tickets?${params}`),
  /** Download URL for the same filtered list as CSV. */
  ticketsCsvUrl: (params: URLSearchParams) => `/api/tickets.csv?${params}`,
  ticket: (number: string) => get<TicketView>(`/api/tickets/${encodeURIComponent(number)}`),
  health: () => get<Health>("/api/health"),
  refresh: () => fetch("/api/refresh", { method: "POST" }),
};

/** Fetch + poll. Keeps showing the previous data while a reload is in flight. */
export function usePolling<T>(load: () => Promise<T>, deps: unknown[], intervalMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs]);

  return { data, error, loading, reload };
}
