import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { IngestStore } from "./IngestStore";

const TEST_PATH = path.resolve("../../data/test-ingest.json");

const SAMPLE_INPUT = {
  emailFrom: "user@example.com",
  emailSubject: "Test email",
  emailBody: "Body text",
  emailReceivedAt: "2026-11-20T10:00:00Z",
  classification: "incident" as const,
  classificationReason: "matched keywords",
  draftType: "INCIDENT" as const,
  draftShortDescription: "Test email",
  draftDescription: "Body text",
  draftPriority: "P2" as const,
};

describe("IngestStore", () => {
  afterEach(async () => {
    await rm(TEST_PATH, { force: true });
  });

  it("starts empty", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    expect(store.all()).toEqual([]);
    expect(store.stats()).toEqual({ total: 0, pending: 0, approved: 0, rejected: 0 });
  });

  it("adds a draft in pending state", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    const draft = await store.add(SAMPLE_INPUT);
    expect(draft.id).toBeTruthy();
    expect(draft.status).toBe("pending");
    expect(store.stats().pending).toBe(1);
  });

  it("approves a draft", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    const draft = await store.add(SAMPLE_INPUT);
    const approved = await store.approve(draft.id, "admin", "INC0099999");
    expect(approved?.status).toBe("approved");
    expect(approved?.createdTicketNumber).toBe("INC0099999");
    expect(store.stats().approved).toBe(1);
  });

  it("rejects a draft with reason", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    const draft = await store.add(SAMPLE_INPUT);
    const rejected = await store.reject(draft.id, "admin", "duplicate");
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.rejectionReason).toBe("duplicate");
    expect(store.stats().rejected).toBe(1);
  });

  it("cannot approve an already-rejected draft", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    const draft = await store.add(SAMPLE_INPUT);
    await store.reject(draft.id, "admin", "spam");
    const result = await store.approve(draft.id, "admin", "INC001");
    expect(result).toBeUndefined();
  });

  it("filters by status", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    const d1 = await store.add(SAMPLE_INPUT);
    await store.add(SAMPLE_INPUT);
    await store.approve(d1.id, "admin", "INC001");
    expect(store.queue("pending")).toHaveLength(1);
    expect(store.queue("approved")).toHaveLength(1);
  });

  it("persists and restores", async () => {
    const s1 = new IngestStore(TEST_PATH);
    await s1.restore();
    await s1.add(SAMPLE_INPUT);

    const s2 = new IngestStore(TEST_PATH);
    await s2.restore();
    expect(s2.all()).toHaveLength(1);
  });

  it("updates draft fields", async () => {
    const store = new IngestStore(TEST_PATH);
    await store.restore();
    const draft = await store.add(SAMPLE_INPUT);
    const updated = await store.updateDraft(draft.id, { draftPriority: "P1" });
    expect(updated?.draftPriority).toBe("P1");
  });
});
