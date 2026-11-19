import { Router } from "express";
import { z } from "zod";
import { EMAIL_TEMPLATE_KINDS } from "@regdash/shared";
import type { TemplateStore } from "../email/TemplateStore";

const TemplateBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(EMAIL_TEMPLATE_KINDS as [string, ...string[]]),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10_000),
});

export function templateRoutes(store: TemplateStore) {
  const r = Router();

  r.get("/", (_req, res) => {
    res.json(store.all());
  });

  r.get("/:id", (req, res) => {
    const t = store.get(req.params.id);
    if (!t) return res.status(404).json({ error: "Template not found" });
    res.json(t);
  });

  r.post("/", async (req, res, next) => {
    const parsed = TemplateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    try {
      const created = await store.create(parsed.data as never);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  r.put("/:id", async (req, res, next) => {
    const parsed = TemplateBody.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    try {
      const updated = await store.update(req.params.id, parsed.data as never);
      if (!updated) return res.status(404).json({ error: "Template not found" });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  r.delete("/:id", async (req, res, next) => {
    try {
      const deleted = await store.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Template not found" });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
