import { Router } from "express";
import { z } from "zod";
import type { EmbeddingProvider } from "../copilot/EmbeddingProvider";
import type { KnowledgeStore } from "../copilot/KnowledgeStore";
import type { KnowledgeIndexer } from "../copilot/KnowledgeIndexer";
import type { TicketStore } from "../lib/store";

export interface KnowledgeRouteOptions {
  knowledgeStore: KnowledgeStore;
  embedding: EmbeddingProvider;
  indexer: KnowledgeIndexer;
  ticketStore: TicketStore;
}

const SearchQuery = z.object({
  q: z.string().min(1).max(500),
  topK: z.coerce.number().int().min(1).max(20).default(5),
});

export function knowledgeRoutes({ knowledgeStore, embedding, indexer, ticketStore }: KnowledgeRouteOptions) {
  const r = Router();

  r.get("/search", async (req, res, next) => {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    try {
      const { q, topK } = parsed.data;
      const queryVector = await embedding.embed(q);
      const results = await knowledgeStore.search(queryVector, topK);
      res.json({
        query: q,
        results: results.map((r) => ({
          id: r.chunk.id,
          source: r.chunk.source,
          title: r.chunk.title,
          content: r.chunk.content,
          score: Math.round(r.score * 1000) / 1000,
          metadata: r.chunk.metadata,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/status", (_req, res) => {
    res.json(knowledgeStore.status());
  });

  r.post("/reindex", async (_req, res, next) => {
    try {
      const count = await indexer.indexAll(ticketStore.all());
      res.json({ indexed: count, ...knowledgeStore.status() });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
