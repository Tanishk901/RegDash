import { Router } from "express";
import { z } from "zod";
import { toView } from "@regdash/shared";
import type { EmailService } from "../email/EmailService";
import type { EmailLogStore } from "../email/EmailLogStore";
import type { TemplateStore } from "../email/TemplateStore";
import type { TicketStore } from "../lib/store";
import { mergeTemplate, mergeWithSample, MERGE_FIELDS } from "../email/merge";

export interface EmailRouteOptions {
  emailService: EmailService;
  emailLog: EmailLogStore;
  templateStore: TemplateStore;
  ticketStore: TicketStore;
  now?: () => Date;
}

export function emailRoutes({ emailService, emailLog, templateStore, ticketStore, now = () => new Date() }: EmailRouteOptions) {
  const r = Router();

  r.get("/merge-fields", (_req, res) => {
    res.json(MERGE_FIELDS);
  });

  r.get("/log", (req, res) => {
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : undefined;
    if (ticket) return res.json(emailLog.byTicket(ticket));
    const limit = Number(req.query.limit) || 50;
    res.json(emailLog.recent(limit));
  });

  r.post("/preview", (req, res) => {
    const body = z.object({
      templateId: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      ticketNumber: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });

    const { templateId, ticketNumber } = body.data;
    let subjectText = body.data.subject ?? "";
    let bodyText = body.data.body ?? "";

    if (templateId) {
      const tmpl = templateStore.get(templateId);
      if (!tmpl) return res.status(404).json({ error: "Template not found" });
      subjectText = tmpl.subject;
      bodyText = tmpl.body;
    }

    if (ticketNumber) {
      const raw = ticketStore.get(ticketNumber);
      if (raw) {
        const ticket = toView(raw, now());
        subjectText = mergeTemplate(subjectText, ticket);
        bodyText = mergeTemplate(bodyText, ticket);
      }
    } else {
      subjectText = mergeWithSample(subjectText);
      bodyText = mergeWithSample(bodyText);
    }

    res.json({ subject: subjectText, body: bodyText });
  });

  r.post("/send", async (req, res, next) => {
    const body = z.object({
      to: z.string().min(1),
      subject: z.string().min(1),
      body: z.string().default(""),
      templateId: z.string().optional(),
      ticketNumber: z.string().optional(),
      sentBy: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });

    try {
      const { to, subject, body: bodyText, templateId, ticketNumber, sentBy } = body.data;

      let mergedSubject = subject;
      let mergedBody = bodyText;
      if (ticketNumber) {
        const raw = ticketStore.get(ticketNumber);
        if (raw) {
          const ticket = toView(raw, now());
          mergedSubject = mergeTemplate(subject, ticket);
          mergedBody = mergeTemplate(bodyText, ticket);
        }
      }

      const result = await emailService.send({ to, subject: mergedSubject, body: mergedBody, templateId });
      await emailLog.add({
        to,
        subject: mergedSubject,
        body: mergedBody,
        templateId: templateId ?? null,
        ticketNumber: ticketNumber ?? null,
        trigger: "manual",
        status: result.status,
        error: result.error ?? null,
        messageId: result.messageId,
        sentAt: result.sentAt,
        sentBy: sentBy ?? null,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.post("/bulk", async (req, res, next) => {
    const body = z.object({
      templateId: z.string(),
      ticketNumbers: z.array(z.string()).min(1).max(200),
      sentBy: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });

    const { templateId, ticketNumbers, sentBy } = body.data;
    const template = templateStore.get(templateId);
    if (!template) return res.status(404).json({ error: "Template not found" });

    try {
      let sent = 0;
      let failed = 0;
      for (const num of ticketNumbers) {
        const raw = ticketStore.get(num);
        if (!raw) { failed++; continue; }
        const ticket = toView(raw, now());
        const to = ticket.requestedBy ?? "";
        if (!to) { failed++; continue; }

        const mergedSubject = mergeTemplate(template.subject, ticket);
        const mergedBody = mergeTemplate(template.body, ticket);

        const result = await emailService.send({ to, subject: mergedSubject, body: mergedBody, templateId });
        await emailLog.add({
          to,
          subject: mergedSubject,
          body: mergedBody,
          templateId,
          ticketNumber: num,
          trigger: "bulk",
          status: result.status,
          error: result.error ?? null,
          messageId: result.messageId,
          sentAt: result.sentAt,
          sentBy: sentBy ?? null,
        });
        if (result.status === "sent") sent++; else failed++;
      }
      res.json({ sent, failed, total: ticketNumbers.length });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
