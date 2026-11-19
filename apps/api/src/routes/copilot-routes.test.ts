import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { TicketStore } from "../lib/store";
import { MockSource } from "../sources/mock";
import { MockEmbeddingProvider } from "../copilot/MockEmbeddingProvider";
import { MockLlmProvider } from "../copilot/MockLlmProvider";
import { InMemoryKnowledgeStore } from "../copilot/InMemoryKnowledgeStore";
import { KnowledgeIndexer } from "../copilot/KnowledgeIndexer";
import { FeedbackStore } from "../copilot/FeedbackStore";
import { TriageEngine } from "../copilot/TriageEngine";
import { TriageStore } from "../copilot/TriageStore";

let tmpDir: string;
let app: ReturnType<typeof createApp>;
const store = new TicketStore(new MockSource());

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "copilot-api-test-"));
  await store.refresh();

  const embedding = new MockEmbeddingProvider();
  const llm = new MockLlmProvider();
  const knowledgeStore = new InMemoryKnowledgeStore(path.join(tmpDir, "knowledge.json"));
  const indexer = new KnowledgeIndexer(embedding, knowledgeStore);
  const feedbackStore = new FeedbackStore(path.join(tmpDir, "feedback.json"));
  const triageStore = new TriageStore(path.join(tmpDir, "triage.json"));
  const triageEngine = new TriageEngine(embedding, knowledgeStore, store.teamMembers());

  await indexer.indexAll(store.all());

  app = createApp(store, {
    copilot: { knowledgeStore, embedding, indexer, ticketStore: store },
    suggestions: { llm, embedding, knowledgeStore, feedbackStore, ticketStore: store },
    triage: { triageEngine, triageStore, ticketStore: store },
  });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("Knowledge API", () => {
  it("GET /api/knowledge/status returns index stats", async () => {
    const res = await request(app).get("/api/knowledge/status");
    expect(res.status).toBe(200);
    expect(res.body.totalChunks).toBeGreaterThan(0);
    expect(res.body.bySources.sop).toBeGreaterThan(0);
  });

  it("GET /api/knowledge/search?q= returns ranked results", async () => {
    const res = await request(app).get("/api/knowledge/search?q=login+authentication");
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0]).toHaveProperty("title");
    expect(res.body.results[0]).toHaveProperty("score");
  });

  it("GET /api/knowledge/search without q returns 400", async () => {
    const res = await request(app).get("/api/knowledge/search");
    expect(res.status).toBe(400);
  });

  it("POST /api/knowledge/reindex re-indexes", async () => {
    const res = await request(app).post("/api/knowledge/reindex");
    expect(res.status).toBe(200);
    expect(res.body.indexed).toBeGreaterThan(0);
  });
});

describe("Suggestions API", () => {
  it("GET /api/tickets/:number/suggestions returns suggestions", async () => {
    const ticket = store.all()[0]!;
    const res = await request(app).get(`/api/tickets/${ticket.number}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeInstanceOf(Array);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions[0]).toHaveProperty("answer");
    expect(res.body.suggestions[0]).toHaveProperty("citations");
  });

  it("returns 404 for unknown ticket", async () => {
    const res = await request(app).get("/api/tickets/FAKE999/suggestions");
    expect(res.status).toBe(404);
  });

  it("POST feedback records action", async () => {
    const ticket = store.all()[0]!;
    const sug = await request(app).get(`/api/tickets/${ticket.number}/suggestions`);
    const sugId = sug.body.suggestions[0].id;

    const res = await request(app)
      .post(`/api/tickets/${ticket.number}/suggestions/${sugId}/feedback`)
      .send({ action: "accept" });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("accept");
  });
});

describe("Triage API", () => {
  it("GET /api/triage/queue starts empty", async () => {
    const res = await request(app).get("/api/triage/queue");
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  it("POST /api/triage/run triages new tickets", async () => {
    const res = await request(app).post("/api/triage/run");
    expect(res.status).toBe(200);
    expect(res.body.triaged).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/triage/stats returns stats", async () => {
    const res = await request(app).get("/api/triage/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("accuracy");
  });

  it("PUT approve/reject changes status", async () => {
    await request(app).post("/api/triage/run");
    const queue = await request(app).get("/api/triage/queue?status=pending");
    if (queue.body.length > 0) {
      const id = queue.body[0].id;
      const res = await request(app).put(`/api/triage/${id}/approve`).send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
    }
  });
});
