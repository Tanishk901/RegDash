import { Router } from "express";
import { z } from "zod";
import { INGEST_CLASSIFICATIONS } from "@regdash/shared";
import type { IngestStore } from "../ingestion/IngestStore";
import type { MockMailbox } from "../ingestion/MockMailbox";
import { classifyEmail } from "../ingestion/EmailClassifier";
import type { EmailAutomation } from "../email/EmailAutomation";

export interface IngestionRouteOptions {
  ingestStore: IngestStore;
  mailbox: MockMailbox;
  automation?: EmailAutomation;
}

export function ingestionRoutes({ ingestStore, mailbox, automation }: IngestionRouteOptions) {
  const r = Router();

  r.get("/queue", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const valid = ["pending", "approved", "rejected"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
    }
    res.json(ingestStore.queue(status as never));
  });

  r.get("/stats", (_req, res) => {
    res.json(ingestStore.stats());
  });

  r.get("/:id", (req, res) => {
    const draft = ingestStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    res.json(draft);
  });

  r.post("/poll", async (_req, res, next) => {
    try {
      const emails = await mailbox.fetchNewEmails();
      let created = 0;
      for (const email of emails) {
        const result = classifyEmail(email.subject, email.body);
        await ingestStore.add({
          emailFrom: email.from,
          emailSubject: email.subject,
          emailBody: email.body,
          emailReceivedAt: email.receivedAt,
          classification: result.classification,
          classificationReason: result.reason,
          draftType: result.draftType,
          draftShortDescription: email.subject,
          draftDescription: email.body,
          draftPriority: result.priority,
        });
        created++;
      }
      res.json({ polled: emails.length, created });
    } catch (err) {
      next(err);
    }
  });

  r.put("/:id", async (req, res, next) => {
    const body = z.object({
      draftShortDescription: z.string().min(1).max(500).optional(),
      draftDescription: z.string().min(1).max(10_000).optional(),
      draftPriority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
      draftType: z.enum(["INCIDENT", "SR"]).optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      const updated = await ingestStore.updateDraft(req.params.id, body.data);
      if (!updated) return res.status(404).json({ error: "Draft not found or not pending" });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  r.put("/:id/approve", async (req, res, next) => {
    const body = z.object({
      reviewedBy: z.string().min(1).max(200),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      const draft = ingestStore.get(req.params.id);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      const prefix = draft.draftType === "INCIDENT" ? "INC" : "RITM";
      const ticketNumber = `${prefix}${String(Date.now()).slice(-7)}`;

      const approved = await ingestStore.approve(req.params.id, body.data.reviewedBy, ticketNumber);
      if (!approved) return res.status(409).json({ error: "Draft is not pending" });

      res.json(approved);
    } catch (err) {
      next(err);
    }
  });

  r.put("/:id/reject", async (req, res, next) => {
    const body = z.object({
      reviewedBy: z.string().min(1).max(200),
      reason: z.string().min(1).max(1000),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten().fieldErrors });
    try {
      const rejected = await ingestStore.reject(req.params.id, body.data.reviewedBy, body.data.reason);
      if (!rejected) return res.status(404).json({ error: "Draft not found or not pending" });
      res.json(rejected);
    } catch (err) {
      next(err);
    }
  });

  r.post("/reset", async (_req, res) => {
    mailbox.reset();
    res.json({ ok: true });
  });

  return r;
}
