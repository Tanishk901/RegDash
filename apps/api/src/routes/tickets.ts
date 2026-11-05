import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { PRIORITIES, STATUSES, toView, type TicketView } from "@regdash/shared";
import type { TicketStore } from "../lib/store";
import { ticketsToCsv } from "../lib/csv";
import { applyFilters, sortViews, summarize } from "../lib/query";
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
  sort: z.enum(["sla", "priority", "age", "updated"]).default("sla"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

export interface RouteOptions {
  now?: () => Date;
  /** ServiceNow instance URL for "Open in ServiceNow" links. Not a secret, but kept out of git. */
  servicenowUrl?: string;
  /** Enables uploading a tracker workbook from the dashboard. */
  upload?: TrackerUpload;
}

export function ticketRoutes(store: TicketStore, { now = () => new Date(), servicenowUrl, upload }: RouteOptions = {}) {
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
      servicenowUrl: servicenowUrl ?? null,
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

  r.get("/tickets/:number", (req, res) => {
    const t = store.get(req.params.number);
    if (!t) return res.status(404).json({ error: `Ticket ${req.params.number} not found` });
    res.json(toView(t, now()));
  });

  return r;
}
