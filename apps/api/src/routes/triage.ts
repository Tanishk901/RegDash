import { Router } from "express";
import { z } from "zod";
import type { TriageEngine } from "../copilot/TriageEngine";
import type { TriageStore } from "../copilot/TriageStore";
import type { TicketStore } from "../lib/store";

export interface TriageRouteOptions {
  triageEngine: TriageEngine;
  triageStore: TriageStore;
  ticketStore: TicketStore;
}

const ReviewBody = z.object({
  by: z.string().min(1).max(200).default("You"),
});

export function triageRoutes({ triageEngine, triageStore, ticketStore }: TriageRouteOptions) {
  const r = Router();

  r.get("/queue", (req, res) => {
    const status = req.query.status as "pending" | "approved" | "rejected" | undefined;
    res.json(triageStore.queue(status));
  });

  r.get("/stats", (_req, res) => {
    res.json(triageStore.stats());
  });

  r.post("/run", async (_req, res, next) => {
    try {
      const tickets = ticketStore.all();
      const newTickets = tickets.filter((t) => t.status === "NEW");
      const existing = new Set(triageStore.queue().map((s) => s.ticketNumber));
      const toTriage = newTickets.filter((t) => !existing.has(t.number));

      const results = [];
      for (const ticket of toTriage) {
        const suggestion = await triageEngine.triage(ticket, tickets);
        const saved = await triageStore.add(suggestion);
        results.push(saved);
      }

      res.json({ triaged: results.length, results });
    } catch (err) {
      next(err);
    }
  });

  r.put("/:id/approve", async (req, res) => {
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const item = await triageStore.approve(req.params.id, parsed.data.by);
    if (!item) return res.status(404).json({ error: "Triage item not found" });
    res.json(item);
  });

  r.put("/:id/reject", async (req, res) => {
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const item = await triageStore.reject(req.params.id, parsed.data.by);
    if (!item) return res.status(404).json({ error: "Triage item not found" });
    res.json(item);
  });

  return r;
}
