import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockEmbeddingProvider } from "./MockEmbeddingProvider";
import { MockLlmProvider } from "./MockLlmProvider";
import { InMemoryKnowledgeStore } from "./InMemoryKnowledgeStore";
import { KnowledgeIndexer } from "./KnowledgeIndexer";
import { FeedbackStore } from "./FeedbackStore";
import { TriageEngine } from "./TriageEngine";
import { TriageStore } from "./TriageStore";
import { generateMockTickets } from "../sources/mock";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "copilot-test-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("MockEmbeddingProvider", () => {
  const emb = new MockEmbeddingProvider();

  it("returns vectors of the declared dimension", async () => {
    const vec = await emb.embed("hello world");
    expect(vec).toHaveLength(emb.dimensions);
  });

  it("returns deterministic vectors", async () => {
    const a = await emb.embed("test input");
    const b = await emb.embed("test input");
    expect(a).toEqual(b);
  });

  it("returns unit vectors (normalized)", async () => {
    const vec = await emb.embed("some text");
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1, 4);
  });

  it("embedBatch returns one vector per input", async () => {
    const vecs = await emb.embedBatch(["a", "b", "c"]);
    expect(vecs).toHaveLength(3);
    for (const v of vecs) expect(v).toHaveLength(emb.dimensions);
  });
});

describe("MockLlmProvider", () => {
  const llm = new MockLlmProvider();

  it("returns a relevant answer for login-related prompts", async () => {
    const res = await llm.generateAnswer("user unable to login", []);
    expect(res.answer).toContain("role mapping");
    expect(res.model).toBe("mock-llm-v1");
  });

  it("returns default answer for unrelated prompts", async () => {
    const res = await llm.generateAnswer("xyzzy gibberish", []);
    expect(res.answer).toContain("Review the ticket details");
  });

  it("includes citations from provided context", async () => {
    const ctx = ["SOP: Login troubleshooting steps here"];
    const res = await llm.generateAnswer("login issue", ctx);
    expect(res.citations).toHaveLength(1);
    expect(res.citations[0]!.snippet).toContain("SOP: Login");
  });
});

describe("InMemoryKnowledgeStore", () => {
  it("adds chunks and searches by cosine similarity", async () => {
    const emb = new MockEmbeddingProvider();
    const store = new InMemoryKnowledgeStore(path.join(tmpDir, "knowledge.json"));

    const vec1 = await emb.embed("login authentication");
    const vec2 = await emb.embed("performance slow");

    await store.add([
      { id: "c1", source: "sop", title: "Login SOP", content: "Steps for login", vector: vec1, metadata: {} },
      { id: "c2", source: "sop", title: "Perf SOP", content: "Steps for perf", vector: vec2, metadata: {} },
    ]);

    const queryVec = await emb.embed("user cannot log in");
    const results = await store.search(queryVec, 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.chunk.id).toBeDefined();
  });

  it("reports status correctly", async () => {
    const store = new InMemoryKnowledgeStore(path.join(tmpDir, "knowledge2.json"));
    expect(store.status().totalChunks).toBe(0);

    await store.add([
      { id: "x", source: "ticket", title: "T", content: "C", vector: [1, 0], metadata: {} },
    ]);

    const status = store.status();
    expect(status.totalChunks).toBe(1);
    expect(status.bySources.ticket).toBe(1);
    expect(status.lastIndexedAt).toBeTruthy();
  });

  it("persists and restores", async () => {
    const fp = path.join(tmpDir, "knowledge3.json");
    const store1 = new InMemoryKnowledgeStore(fp);
    await store1.add([
      { id: "p1", source: "sop", title: "Persist", content: "Test", vector: [0.5, 0.5], metadata: {} },
    ]);

    const store2 = new InMemoryKnowledgeStore(fp);
    await store2.restore();
    expect(store2.status().totalChunks).toBe(1);
    expect(store2.allChunks()[0]!.title).toBe("Persist");
  });
});

describe("KnowledgeIndexer", () => {
  it("indexes SOPs and closed tickets", async () => {
    const emb = new MockEmbeddingProvider();
    const store = new InMemoryKnowledgeStore(path.join(tmpDir, "idx.json"));
    const indexer = new KnowledgeIndexer(emb, store);

    const tickets = generateMockTickets(10);
    const count = await indexer.indexAll(tickets);

    expect(count).toBeGreaterThan(0);
    expect(store.status().totalChunks).toBe(count);
    expect(store.status().bySources.sop).toBeGreaterThan(0);
  });
});

describe("FeedbackStore", () => {
  it("records and retrieves feedback", async () => {
    const store = new FeedbackStore(path.join(tmpDir, "feedback.json"));
    const fb = await store.record("INC001", "sug-1", "accept", "Tester");

    expect(fb.action).toBe("accept");
    expect(store.forTicket("INC001")).toHaveLength(1);

    const stats = store.stats();
    expect(stats.total).toBe(1);
    expect(stats.byAction.accept).toBe(1);
  });
});

describe("TriageEngine", () => {
  it("suggests priority based on keywords", async () => {
    const emb = new MockEmbeddingProvider();
    const store = new InMemoryKnowledgeStore(path.join(tmpDir, "triage-kb.json"));
    const engine = new TriageEngine(emb, store, ["Alice", "Bob"]);

    const ticket = generateMockTickets(1)[0]!;
    ticket.shortDescription = "Critical production outage — users cannot access the system";
    ticket.status = "NEW";

    const result = await engine.triage(ticket, []);
    expect(result.suggestedPriority).toBe("P1");
    expect(result.suggestedAssignee).toBeTruthy();
  });

  it("suggests lowest-workload assignee", async () => {
    const emb = new MockEmbeddingProvider();
    const store = new InMemoryKnowledgeStore(path.join(tmpDir, "triage-kb2.json"));
    const engine = new TriageEngine(emb, store, ["Alice", "Bob"]);

    const tickets = generateMockTickets(5);
    for (const t of tickets) t.assignedTo = "Alice";

    const ticket = tickets[0]!;
    ticket.status = "NEW";
    ticket.assignedTo = null;

    const result = await engine.triage(ticket, tickets);
    expect(result.suggestedAssignee).toBe("Bob");
  });
});

describe("TriageStore", () => {
  it("adds, approves, and rejects items", async () => {
    const store = new TriageStore(path.join(tmpDir, "triage-queue.json"));

    const item = await store.add({
      ticketNumber: "INC001",
      suggestedPriority: "P2",
      suggestedCategory: "INCIDENT",
      suggestedAssignee: "Alice",
      confidence: 0.75,
      reasoning: "Test",
      originalPriority: "P3",
      originalAssignee: null,
    });

    expect(item.status).toBe("pending");
    expect(store.queue("pending")).toHaveLength(1);

    await store.approve(item.id, "Reviewer");
    expect(store.get(item.id)!.status).toBe("approved");

    const stats = store.stats();
    expect(stats.approved).toBe(1);
    expect(stats.accuracy).toBe(1);
  });

  it("persists and restores", async () => {
    const fp = path.join(tmpDir, "triage-persist.json");
    const store1 = new TriageStore(fp);
    await store1.add({
      ticketNumber: "INC002",
      suggestedPriority: "P1",
      suggestedCategory: "INCIDENT",
      suggestedAssignee: null,
      confidence: 0.5,
      reasoning: "Persist test",
      originalPriority: "P2",
      originalAssignee: null,
    });

    const store2 = new TriageStore(fp);
    await store2.restore();
    expect(store2.queue()).toHaveLength(1);
  });
});
