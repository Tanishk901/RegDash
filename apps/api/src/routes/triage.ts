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
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const valid = ["pending", "approved", "rejected"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
    }
    res.json(triageStore.queue(status as "pending" | "approved" | "rejected" | undefined));
  });

  r.get("/stats", (_req, res) => {
    res.json(triageStore.stats());
  });

  r.get("/queue.csv", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const valid = ["pending", "approved", "rejected"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
    }
    const items = triageStore.queue(status as "pending" | "approved" | "rejected" | undefined);
    const header = "Ticket,Priority,Category,Assignee,Confidence,Status,Reasoning,Created,Reviewed At\n";
    const rows = items.map((s) =>
      [
        s.ticketNumber,
        s.suggestedPriority,
        s.suggestedCategory,
        s.suggestedAssignee ?? "",
        String(s.confidence),
        s.status,
        `"${s.reasoning.replace(/"/g, '""')}"`,
        s.createdAt,
        s.reviewedAt ?? "",
      ].join(","),
    );
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res
      .type("text/csv; charset=utf-8")
      .attachment(`regdash-triage-${stamp}.csv`)
      .send(header + rows.join("\n"));
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

  r.put("/bulk", async (req, res) => {
    const body = z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      action: z.enum(["approve", "reject"]),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    const { ids, action } = body.data;
    let processed = 0;
    for (const id of ids) {
      const result = action === "approve"
        ? await triageStore.approve(id, "You")
        : await triageStore.reject(id, "You");
      if (result) processed++;
    }
    res.json({ processed });
  });

  r.get("/trend", (_req, res) => {
    const all = triageStore.queue();
    const days = 7;
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const trend: { date: string; approved: number; rejected: number; total: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now - i * DAY);
      const dateStr = dayStart.toISOString().slice(0, 10);
      const dayItems = all.filter((s) => s.reviewedAt && s.reviewedAt.startsWith(dateStr));
      trend.push({
        date: dateStr,
        approved: dayItems.filter((s) => s.status === "approved").length,
        rejected: dayItems.filter((s) => s.status === "rejected").length,
        total: dayItems.length,
      });
    }
    res.json(trend);
  });

  r.put("/:id/approve", async (req, res) => {
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const existing = triageStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Triage item not found" });
    const item = await triageStore.approve(req.params.id, parsed.data.by);
    if (!item) return res.status(409).json({ error: "Triage item is not pending" });
    res.json(item);
  });

  r.put("/:id/reject", async (req, res) => {
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const existing = triageStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Triage item not found" });
    const item = await triageStore.reject(req.params.id, parsed.data.by);
    if (!item) return res.status(409).json({ error: "Triage item is not pending" });
    res.json(item);
  });

  return r;
}
