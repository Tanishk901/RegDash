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
  copilot?: { enabled: boolean; triage: boolean };
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

export interface Suggestion {
  id: string;
  answer: string;
  citations: { chunkId: string; title: string; snippet: string }[];
  model: string;
  feedback: "accept" | "dismiss" | "flag" | null;
}

export interface SuggestionsResponse {
  ticketNumber: string;
  suggestions: Suggestion[];
  sources: { id: string; title: string; source: string; score: number }[];
}

export interface KnowledgeResult {
  id: string;
  source: string;
  title: string;
  content: string;
  score: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  results: KnowledgeResult[];
}

export interface FeedbackStats {
  total: number;
  byAction: { accept: number; dismiss: number; flag: number };
}

export interface KnowledgeStatus {
  totalChunks: number;
  bySources: Record<string, number>;
  lastIndexedAt: string | null;
}

export interface TriageItem {
  id: string;
  ticketNumber: string;
  suggestedPriority: string;
  suggestedCategory: string;
  suggestedAssignee: string | null;
  confidence: number;
  reasoning: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  originalPriority: string;
  originalAssignee: string | null;
}

export interface TriageTrendDay {
  date: string;
  approved: number;
  rejected: number;
  total: number;
}

export interface TriageStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  accuracy: number;
}

export interface EmailTemplateListItem {
  id: string;
  name: string;
  kind: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateCreateInput {
  name: string;
  kind: string;
  subject: string;
  body: string;
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

  suggestions: (number: string) =>
    get<SuggestionsResponse>(`/api/tickets/${encodeURIComponent(number)}/suggestions`),
  suggestionFeedback: (number: string, suggestionId: string, action: "accept" | "dismiss" | "flag") =>
    send<unknown>(`/api/tickets/${encodeURIComponent(number)}/suggestions/${encodeURIComponent(suggestionId)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }),

  knowledgeSearch: (q: string) =>
    get<KnowledgeSearchResponse>(`/api/knowledge/search?q=${encodeURIComponent(q)}`),
  knowledgeStatus: () => get<KnowledgeStatus>("/api/knowledge/status"),
  feedbackStats: () => get<FeedbackStats>("/api/knowledge/feedback-stats"),

  triageQueue: (status?: string) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    return get<TriageItem[]>(`/api/triage/queue?${p}`);
  },
  triageStats: () => get<TriageStats>("/api/triage/stats"),
  triageTrend: () => get<TriageTrendDay[]>("/api/triage/trend"),
  triageRun: () => send<{ triaged: number }>("/api/triage/run", { method: "POST" }),
  triageApprove: (id: string) =>
    send<TriageItem>(`/api/triage/${encodeURIComponent(id)}/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  triageReject: (id: string) =>
    send<TriageItem>(`/api/triage/${encodeURIComponent(id)}/reject`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  triageBulk: (ids: string[], action: "approve" | "reject") =>
    send<{ processed: number }>("/api/triage/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    }),

  templates: () => get<EmailTemplateListItem[]>("/api/templates"),
  template: (id: string) => get<EmailTemplateListItem>(`/api/templates/${encodeURIComponent(id)}`),
  createTemplate: (input: EmailTemplateCreateInput) =>
    send<EmailTemplateListItem>("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateTemplate: (id: string, input: Partial<EmailTemplateCreateInput>) =>
    send<EmailTemplateListItem>(`/api/templates/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  deleteTemplate: (id: string) =>
    send<{ ok: boolean }>(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
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
