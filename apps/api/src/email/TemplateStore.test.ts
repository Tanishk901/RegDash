import { describe, it, expect, beforeEach } from "vitest";
import { TemplateStore } from "./TemplateStore";
import path from "node:path";
import { rm } from "node:fs/promises";
import os from "node:os";

const tmpFile = () => path.join(os.tmpdir(), `regdash-test-templates-${Date.now()}.json`);

describe("TemplateStore", () => {
  let store: TemplateStore;
  let filePath: string;

  beforeEach(async () => {
    filePath = tmpFile();
    store = new TemplateStore(filePath);
    await store.restore();
  });

  afterEach(async () => {
    await rm(filePath, { force: true });
  });

  it("starts empty", () => {
    expect(store.all()).toHaveLength(0);
  });

  it("creates and retrieves a template", async () => {
    const t = await store.create({ name: "Welcome", kind: "welcome", subject: "Welcome!", body: "Hello {{ticket}}" });
    expect(t.id).toBeTruthy();
    expect(t.name).toBe("Welcome");
    expect(store.get(t.id)).toEqual(t);
  });

  it("updates a template", async () => {
    const t = await store.create({ name: "Old", kind: "reminder", subject: "Reminder", body: "Body" });
    const updated = await store.update(t.id, { name: "New" });
    expect(updated?.name).toBe("New");
    expect(updated?.subject).toBe("Reminder");
  });

  it("returns undefined for unknown update", async () => {
    expect(await store.update("nope", { name: "X" })).toBeUndefined();
  });

  it("deletes a template", async () => {
    const t = await store.create({ name: "Del", kind: "custom", subject: "S", body: "B" });
    expect(await store.delete(t.id)).toBe(true);
    expect(store.get(t.id)).toBeUndefined();
    expect(await store.delete(t.id)).toBe(false);
  });

  it("persists and restores", async () => {
    await store.create({ name: "Persist", kind: "escalation", subject: "S", body: "B" });
    const store2 = new TemplateStore(filePath);
    await store2.restore();
    expect(store2.all()).toHaveLength(1);
    expect(store2.all()[0]!.name).toBe("Persist");
  });
});
