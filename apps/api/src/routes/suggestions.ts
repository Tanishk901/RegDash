import { Router } from "express";
import { z } from "zod";
import type { LlmProvider } from "../copilot/LlmProvider";
import type { EmbeddingProvider } from "../copilot/EmbeddingProvider";
import type { KnowledgeStore } from "../copilot/KnowledgeStore";
import type { FeedbackStore } from "../copilot/FeedbackStore";
import type { TicketStore } from "../lib/store";

export interface SuggestionsRouteOptions {
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  knowledgeStore: KnowledgeStore;
  feedbackStore: FeedbackStore;
  ticketStore: TicketStore;
}

const FeedbackBody = z.object({
  action: z.enum(["accept", "dismiss", "flag"]),
  by: z.string().min(1).max(200).default("You"),
});

export function suggestionsRoutes({ llm, embedding, knowledgeStore, feedbackStore, ticketStore }: SuggestionsRouteOptions) {
  const r = Router();

  r.get("/:number/suggestions", async (req, res, next) => {
    const ticket = ticketStore.get(req.params.number);
    if (!ticket) return res.status(404).json({ error: `Ticket ${req.params.number} not found` });

    try {
      const query = `${ticket.shortDescription} ${ticket.description ?? ""}`.trim();
      const queryVector = await embedding.embed(query);
      const context = await knowledgeStore.search(queryVector, 3);
      const contextTexts = context.map((r) => `[${r.chunk.title}]\n${r.chunk.content}`);
      const prompt = `Ticket: ${ticket.shortDescription}\nDescription: ${ticket.description ?? "N/A"}\nPriority: ${ticket.priority}\nStatus: ${ticket.status}`;
      const answer = await llm.generateAnswer(prompt, contextTexts);

      const existing = feedbackStore.forTicket(ticket.number);
      const feedbackMap = new Map(existing.map((f) => [f.suggestionId, f.action]));

      const suggestions = [{
        id: `sug-${ticket.number}-0`,
        answer: answer.answer,
        citations: answer.citations,
        model: answer.model,
        feedback: feedbackMap.get(`sug-${ticket.number}-0`) ?? null,
      }];

      if (context.length > 0) {
        suggestions.push({
          id: `sug-${ticket.number}-1`,
          answer: `Related knowledge: ${context[0]!.chunk.title} — ${context[0]!.chunk.content.slice(0, 200)}`,
          citations: [{ chunkId: context[0]!.chunk.id, title: context[0]!.chunk.title, snippet: context[0]!.chunk.content.slice(0, 200) }],
          model: "knowledge-match",
          feedback: feedbackMap.get(`sug-${ticket.number}-1`) ?? null,
        });
      }

      res.json({
        ticketNumber: ticket.number,
        suggestions,
        sources: context.map((r) => ({
          id: r.chunk.id,
          title: r.chunk.title,
          source: r.chunk.source,
          score: Math.round(r.score * 1000) / 1000,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/:number/suggestions/:suggestionId/feedback", async (req, res, next) => {
    const parsed = FeedbackBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    try {
      const fb = await feedbackStore.record(req.params.number, req.params.suggestionId, parsed.data.action, parsed.data.by);
      res.json(fb);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
