import { Router } from "express";
import { z } from "zod";
import type { EmailAutomation } from "../email/EmailAutomation";
import type { TicketStore } from "../lib/store";

export interface AutomationRouteOptions {
  automation: EmailAutomation;
  ticketStore: TicketStore;
}

export function automationRoutes({ automation, ticketStore }: AutomationRouteOptions) {
  const r = Router();

  r.get("/config", (_req, res) => {
    res.json(automation.getConfig());
  });

  r.put("/config", (req, res) => {
    const body = z.object({
      staleReminderDays: z.number().min(1).max(30).optional(),
      enabled: z.boolean().optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    res.json(automation.updateConfig(body.data));
  });

  r.post("/stale-reminders", async (_req, res, next) => {
    try {
      const result = await automation.sendStaleReminders(ticketStore.all());
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.post("/welcome", async (req, res, next) => {
    const body = z.object({
      to: z.string().min(1),
      name: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      const result = await automation.sendWelcomeEmail(body.data.to, { name: body.data.name ?? "" });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.post("/acknowledge", async (req, res, next) => {
    const body = z.object({
      ticketNumber: z.string().min(1),
      to: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      const ticket = ticketStore.get(body.data.ticketNumber);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      const result = await automation.sendAcknowledgement(ticket, body.data.to);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
