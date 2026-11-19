import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardSummary, SavedView, SavedViewInput, SourceReading, TicketView } from "@regdash/shared";

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
  /** How a spreadsheet source was understood; null for other sources. */
  reading: SourceReading | null;
  /** Set when SERVICENOW_BASE_URL is configured; enables "Open in ServiceNow" links. */
  servicenowUrl: string | null;
  refreshIntervalSeconds: number | null;
  /** Set while a workbook uploaded from the dashboard is the live source. */
  upload: { fileName: string; uploadedAt: string } | null;
}

export interface UploadResult {
  fileName: string;
  uploadedAt: string;
  tickets: number;
  rejected: number;
  lastError: string | null;
}

export interface RemoveUploadResult {
  source: string;
  tickets: number;
  lastError: string | null;
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

/** For writes whose error message is meant to be shown to the user as-is. */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
  return body as T;
}

export interface TeamInfo {
  members: string[];
  writable: boolean;
}

export interface ExportColumn {
  key: string;
  header: string;
}

export const api = {
  summary: () => get<DashboardSummary>("/api/summary"),
  tickets: (params: URLSearchParams) => get<TicketList>(`/api/tickets?${params}`),
  ticketsCsvUrl: (params: URLSearchParams) => `/api/tickets.csv?${params}`,
  ticketsXlsxUrl: (params: URLSearchParams, columns?: string[]) => {
    const p = new URLSearchParams(params);
    if (columns?.length) p.set("columns", columns.join(","));
    return `/api/tickets.xlsx?${p}`;
  },
  summaryCsvUrl: () => "/api/summary.csv",
  summaryXlsxUrl: () => "/api/summary.xlsx",
  ticket: (number: string) => get<TicketView>(`/api/tickets/${encodeURIComponent(number)}`),
  health: () => get<Health>("/api/health"),
  refresh: () => fetch("/api/refresh", { method: "POST" }),
  team: () => get<TeamInfo>("/api/team"),
  exportColumns: () => get<ExportColumn[]>("/api/export-columns"),
  upload: (file: File) =>
    send<UploadResult>(`/api/upload?fileName=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: file,
    }),
  removeUpload: () => send<RemoveUploadResult>("/api/upload", { method: "DELETE" }),

  views: (opts?: { pinned?: boolean }) => {
    const p = new URLSearchParams();
    if (opts?.pinned !== undefined) p.set("pinned", String(opts.pinned));
    return get<SavedView[]>(`/api/views?${p}`);
  },
  view: (id: string) => get<SavedView>(`/api/views/${encodeURIComponent(id)}`),
  createView: (input: SavedViewInput) =>
    send<SavedView>("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateView: (id: string, input: Partial<SavedViewInput>) =>
    send<SavedView>(`/api/views/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  deleteView: (id: string) =>
    send<{ ok: boolean }>(`/api/views/${encodeURIComponent(id)}`, { method: "DELETE" }),

  addComment: (number: string, note: string, by: string, kind?: "work_note" | "customer_comment") =>
    send<TicketView>(`/api/tickets/${encodeURIComponent(number)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, by, kind }),
    }),
  assignTicket: (number: string, assignedTo: string | null) =>
    send<TicketView>(`/api/tickets/${encodeURIComponent(number)}/assign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTo }),
    }),
  updateStatus: (number: string, status: string, by: string) =>
    send<TicketView>(`/api/tickets/${encodeURIComponent(number)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, by }),
    }),
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
