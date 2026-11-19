import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { APPLICATION_CODES, ENVIRONMENTS, PRIORITIES, STATUSES, toView, type TicketView } from "@regdash/shared";
import type { TicketStore } from "../lib/store";
import { ticketsToCsv } from "../lib/csv";
import { ALL_EXPORT_COLUMNS, ticketsToXlsx } from "../lib/xlsx";
import { applyFilters, sortViews, summarize } from "../lib/query";
import { summaryCsv, summaryXlsx } from "../lib/summary-export";
import { MAX_UPLOAD_MB, UploadError, XLSX_MIME, type TrackerUpload } from "../lib/upload";

const csv = <T extends [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))
    .pipe(z.array(z.enum(values)));

const ListQuery = z.object({
  type: z.enum(["INCIDENT", "SR"]).optional(),
  status: csv(STATUSES as [string, ...string[]]).optional(),
  priority: csv(PRIORITIES as [string, ...string[]]).optional(),
  sla: z.enum(["OK", "AT_RISK", "BREACHED", "PAUSED"]).optional(),
  assignedTo: z.string().optional(),
  q: z.string().max(200).optional(),
  stale: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  includeClosed: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  application: z.enum(APPLICATION_CODES as [string, ...string[]]).optional(),
  environment: z.enum(ENVIRONMENTS as [string, ...string[]]).optional(),
  sort: z.enum(["sla", "priority", "age", "updated"]).default("sla"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

export interface RouteOptions {
  now?: () => Date;
  /** ServiceNow instance URL for "Open in ServiceNow" links. Not a secret, but kept out of git. */
  servicenowUrl?: string;
  /** Enables uploading a tracker workbook from the dashboard. */
  upload?: TrackerUpload;
  /** How often the backend refreshes data, so the frontend can match. */
  refreshIntervalSeconds?: number;
}

export function ticketRoutes(store: TicketStore, { now = () => new Date(), servicenowUrl, upload, refreshIntervalSeconds }: RouteOptions = {}) {
  const r = Router();

  /** Parses list filters from the query string; sends a 400 and returns null if they're invalid. */
  function list(req: Request, res: Response): TicketView[] | null {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return null;
    }
    const { sort, dir, ...filters } = parsed.data;
    const at = now();
    const views = store.all().map((t) => toView(t, at));
    return sortViews(applyFilters(views, filters as never), sort, dir);
  }

  r.get("/health", (_req, res) => {
    res.json({
      ok: store.lastError === null,
      source: store.source.name,
      tickets: store.all().length,
      lastRefreshedAt: store.lastRefreshedAt,
      lastError: store.lastError,
      rejectedRows: store.rejectedRows(),
      reading: store.reading(),
      servicenowUrl: servicenowUrl ?? null,
      refreshIntervalSeconds: refreshIntervalSeconds ?? null,
      upload: upload?.current() ?? null,
    });
  });

  r.post("/refresh", async (_req, res) => {
    await store.refresh();
    res.status(store.lastError ? 502 : 200).json({ lastRefreshedAt: store.lastRefreshedAt, lastError: store.lastError });
  });

  if (upload) {
    // Only this content type is parsed. It forces a CORS preflight, so other websites can't post here.
    r.post("/upload", express.raw({ type: XLSX_MIME, limit: `${MAX_UPLOAD_MB}mb` }), async (req, res, next) => {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(415).json({ error: `Send the workbook as ${XLSX_MIME}` });
      }
      const fileName = z.string().min(1).max(255).safeParse(req.query.fileName);
      if (!fileName.success) return res.status(400).json({ error: "fileName is required" });
      try {
        const info = await upload.save(req.body, fileName.data);
        res.json({ ...info, tickets: store.all().length, rejected: store.rejectedRows().length, lastError: store.lastError });
      } catch (err) {
        if (err instanceof UploadError) return res.status(422).json({ error: err.message });
        next(err);
      }
    });

    r.delete("/upload", async (_req, res, next) => {
      try {
        await upload.remove();
        res.json({ source: store.source.name, tickets: store.all().length, lastError: store.lastError });
      } catch (err) {
        next(err);
      }
    });
  }

  r.get("/summary", (_req, res) => {
    res.json(summarize(store.all(), now(), { lastRefreshedAt: store.lastRefreshedAt, source: store.source.name }));
  });

  r.get("/summary.csv", (_req, res) => {
    const s = summarize(store.all(), now(), { lastRefreshedAt: store.lastRefreshedAt, source: store.source.name });
    const stamp = now().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res
      .type("text/csv; charset=utf-8")
      .attachment(`regdash-summary-${stamp}.csv`)
      .send(summaryCsv(s));
  });

  r.get("/summary.xlsx", async (_req, res, next) => {
    try {
      const s = summarize(store.all(), now(), { lastRefreshedAt: store.lastRefreshedAt, source: store.source.name });
      const stamp = now().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      res
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .attachment(`regdash-summary-${stamp}.xlsx`)
        .send(await summaryXlsx(s));
    } catch (err) {
      next(err);
    }
  });

  r.get("/tickets", (req, res) => {
    const items = list(req, res);
    if (!items) return;
    // Owners list for the filter dropdown, independent of the current filter.
    const owners = [...new Set(store.all().map((t) => t.assignedTo).filter((o): o is string => !!o))].sort();
    res.json({ items, total: items.length, owners });
  });

  /** Same filters as /tickets, as a spreadsheet download. */
  r.get("/tickets.csv", (req, res) => {
    const items = list(req, res);
    if (!items) return;
    const stamp = now().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res
      .type("text/csv; charset=utf-8")
      .attachment(`regdash-tickets-${stamp}.csv`)
      .send(ticketsToCsv(items));
  });

  /** Same filters as /tickets, as an Excel download with optional column selection. */
  r.get("/tickets.xlsx", async (req, res, next) => {
    const items = list(req, res);
    if (!items) return;
    const cols = typeof req.query.columns === "string"
      ? req.query.columns.split(",").filter(Boolean)
      : undefined;
    try {
      const buf = await ticketsToXlsx(items, cols);
      const stamp = now().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      res
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .attachment(`regdash-tickets-${stamp}.xlsx`)
        .send(buf);
    } catch (err) {
      next(err);
    }
  });

  r.get("/export-columns", (_req, res) => {
    res.json(ALL_EXPORT_COLUMNS.map((c) => ({ key: c.key, header: c.header })));
  });

  r.get("/team", (_req, res) => {
    res.json({ members: store.teamMembers(), writable: store.writable });
  });

  r.get("/tickets/:number", (req, res) => {
    const t = store.get(req.params.number);
    if (!t) return res.status(404).json({ error: `Ticket ${req.params.number} not found` });
    res.json(toView(t, now()));
  });

  r.post("/tickets/:number/comments", async (req, res, next) => {
    if (!store.writable) return res.status(403).json({ error: "Data source is read-only" });
    const body = z.object({
      note: z.string().min(1).max(4000),
      by: z.string().min(1).max(200),
      kind: z.enum(["work_note", "customer_comment"]).optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      await store.addComment(req.params.number, body.data.note, body.data.by, body.data.kind);
      const t = store.get(req.params.number);
      res.json(t ? toView(t, now()) : { ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  r.put("/tickets/:number/assign", async (req, res, next) => {
    if (!store.writable) return res.status(403).json({ error: "Data source is read-only" });
    const body = z.object({ assignedTo: z.string().max(200).nullable() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      await store.updateAssignment(req.params.number, body.data.assignedTo);
      const t = store.get(req.params.number);
      res.json(t ? toView(t, now()) : { ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  r.put("/tickets/:number/status", async (req, res, next) => {
    if (!store.writable) return res.status(403).json({ error: "Data source is read-only" });
    const body = z.object({
      status: z.enum(STATUSES as [string, ...string[]]),
      by: z.string().min(1).max(200),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      await store.updateStatus(req.params.number, body.data.status as never, body.data.by);
      const t = store.get(req.params.number);
      res.json(t ? toView(t, now()) : { ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  return r;
}
