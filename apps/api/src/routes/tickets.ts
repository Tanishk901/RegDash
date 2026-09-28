import { Router } from "express";
import { z } from "zod";
import { PRIORITIES, STATUSES, toView } from "@regdash/shared";
import type { TicketStore } from "../lib/store";
import { applyFilters, sortViews, summarize } from "../lib/query";

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

export function ticketRoutes(store: TicketStore, now: () => Date = () => new Date()) {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({
      ok: store.lastError === null,
      source: store.source.name,
      tickets: store.all().length,
      lastRefreshedAt: store.lastRefreshedAt,
      lastError: store.lastError,
      rejectedRows: store.rejectedRows(),
    });
  });

  r.post("/refresh", async (_req, res) => {
    await store.refresh();
    res.status(store.lastError ? 502 : 200).json({ lastRefreshedAt: store.lastRefreshedAt, lastError: store.lastError });
  });

  r.get("/summary", (_req, res) => {
    res.json(summarize(store.all(), now(), { lastRefreshedAt: store.lastRefreshedAt, source: store.source.name }));
  });

  r.get("/tickets", (req, res) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const { sort, dir, ...filters } = parsed.data;
    const at = now();
    const views = store.all().map((t) => toView(t, at));
    const items = sortViews(applyFilters(views, filters as never), sort, dir);
    // Owners list for the filter dropdown, independent of the current filter.
    const owners = [...new Set(store.all().map((t) => t.assignedTo).filter((o): o is string => !!o))].sort();
    res.json({ items, total: items.length, owners });
  });

  r.get("/tickets/:number", (req, res) => {
    const t = store.get(req.params.number);
    if (!t) return res.status(404).json({ error: `Ticket ${req.params.number} not found` });
    res.json(toView(t, now()));
  });

  return r;
}
