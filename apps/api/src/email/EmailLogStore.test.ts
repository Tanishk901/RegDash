import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { EmailLogStore } from "./EmailLogStore";

const TEST_PATH = path.resolve("../../data/test-email-log.json");

describe("EmailLogStore", () => {
  afterEach(async () => {
    await rm(TEST_PATH, { force: true });
  });

  it("starts empty", async () => {
    const store = new EmailLogStore(TEST_PATH);
    await store.restore();
    expect(store.all()).toEqual([]);
  });

  it("adds and retrieves entries", async () => {
    const store = new EmailLogStore(TEST_PATH);
    await store.restore();
    const entry = await store.add({
      to: "user@example.com",
      subject: "Test",
      body: "Hello",
      templateId: null,
      ticketNumber: "INC001",
      trigger: "manual",
      status: "sent",
      error: null,
      messageId: "msg-1",
      sentAt: new Date().toISOString(),
      sentBy: "admin",
    });
    expect(entry.id).toBeTruthy();
    expect(store.all()).toHaveLength(1);
  });

  it("filters by ticket number", async () => {
    const store = new EmailLogStore(TEST_PATH);
    await store.restore();
    await store.add({ to: "a@b.com", subject: "A", body: "", templateId: null, ticketNumber: "INC001", trigger: "manual", status: "sent", error: null, messageId: "1", sentAt: new Date().toISOString(), sentBy: null });
    await store.add({ to: "c@d.com", subject: "B", body: "", templateId: null, ticketNumber: "INC002", trigger: "manual", status: "sent", error: null, messageId: "2", sentAt: new Date().toISOString(), sentBy: null });
    expect(store.byTicket("INC001")).toHaveLength(1);
    expect(store.byTicket("INC999")).toHaveLength(0);
  });

  it("returns recent entries in reverse order", async () => {
    const store = new EmailLogStore(TEST_PATH);
    await store.restore();
    await store.add({ to: "a@b.com", subject: "First", body: "", templateId: null, ticketNumber: null, trigger: "manual", status: "sent", error: null, messageId: "1", sentAt: "2026-01-01T00:00:00Z", sentBy: null });
    await store.add({ to: "a@b.com", subject: "Second", body: "", templateId: null, ticketNumber: null, trigger: "manual", status: "sent", error: null, messageId: "2", sentAt: "2026-01-02T00:00:00Z", sentBy: null });
    const recent = store.recent(10);
    expect(recent[0]!.subject).toBe("Second");
    expect(recent[1]!.subject).toBe("First");
  });

  it("persists and restores", async () => {
    const store1 = new EmailLogStore(TEST_PATH);
    await store1.restore();
    await store1.add({ to: "x@y.com", subject: "Persist", body: "", templateId: null, ticketNumber: null, trigger: "manual", status: "sent", error: null, messageId: "1", sentAt: new Date().toISOString(), sentBy: null });

    const store2 = new EmailLogStore(TEST_PATH);
    await store2.restore();
    expect(store2.all()).toHaveLength(1);
    expect(store2.all()[0]!.subject).toBe("Persist");
  });
});
