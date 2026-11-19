import { Router } from "express";
import { z } from "zod";
import {
  APPLICATION_CODES,
  ENVIRONMENTS,
  GROUP_BY_FIELDS,
  PRIORITIES,
  STATUSES,
} from "@regdash/shared";
import type { ViewStore } from "../lib/view-store";

const csv = <T extends [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))
    .pipe(z.array(z.enum(values)));

const FiltersSchema = z.object({
  type: z.enum(["INCIDENT", "SR"]).optional(),
  status: csv(STATUSES as [string, ...string[]]).optional(),
  priority: csv(PRIORITIES as [string, ...string[]]).optional(),
  sla: z.enum(["OK", "AT_RISK", "BREACHED", "PAUSED"]).optional(),
  assignedTo: z.string().optional(),
  q: z.string().max(200).optional(),
  stale: z.boolean().optional(),
  includeClosed: z.boolean().optional(),
  application: z.enum(APPLICATION_CODES as [string, ...string[]]).optional(),
  environment: z.enum(ENVIRONMENTS as [string, ...string[]]).optional(),
}).default({});

const SavedViewInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  columns: z.array(z.string().min(1).max(50)).min(1).max(50),
  filters: FiltersSchema,
  sort: z.enum(["sla", "priority", "age", "updated"]).default("sla"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  groupBy: z.enum(GROUP_BY_FIELDS as [string, ...string[]]).nullable().default(null),
  pinned: z.boolean().default(false),
});

export function viewRoutes(viewStore: ViewStore) {
  const r = Router();

  r.get("/", (_req, res) => {
    const pinned = _req.query.pinned === "true" ? true : _req.query.pinned === "false" ? false : undefined;
    res.json(viewStore.list(pinned));
  });

  r.get("/:id", (req, res) => {
    const view = viewStore.get(req.params.id);
    if (!view) return res.status(404).json({ error: "View not found" });
    res.json(view);
  });

  r.post("/", async (req, res) => {
    const parsed = SavedViewInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const view = await viewStore.create(parsed.data as never);
    res.status(201).json(view);
  });

  r.put("/:id", async (req, res) => {
    const parsed = SavedViewInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const view = await viewStore.update(req.params.id, parsed.data as never);
    if (!view) return res.status(404).json({ error: "View not found" });
    res.json(view);
  });

  r.delete("/:id", async (req, res) => {
    const deleted = await viewStore.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: "View not found" });
    res.json({ ok: true });
  });

  return r;
}
