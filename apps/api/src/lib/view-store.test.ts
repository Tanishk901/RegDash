import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ViewStore } from "./view-store";

let dir: string;
let store: ViewStore;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "viewstore-"));
  store = new ViewStore(path.join(dir, "views.json"));
  await store.restore();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ViewStore", () => {
  it("starts empty", () => {
    expect(store.list()).toEqual([]);
  });

  it("creates a view with generated id and timestamps", async () => {
    const view = await store.create({
      name: "My P1s",
      description: "Critical tickets",
      columns: ["number", "summary", "priority"],
      filters: { priority: ["P1"] as never },
      sort: "priority",
      sortDir: "asc",
      groupBy: null,
      pinned: false,
    });
    expect(view.id).toBeTruthy();
    expect(view.name).toBe("My P1s");
    expect(view.createdAt).toBeTruthy();
    expect(view.updatedAt).toBeTruthy();
  });

  it("lists all views", () => {
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]!.name).toBe("My P1s");
  });

  it("gets a view by id", () => {
    const id = store.list()[0]!.id;
    expect(store.get(id)?.name).toBe("My P1s");
  });

  it("returns undefined for unknown id", () => {
    expect(store.get("unknown")).toBeUndefined();
  });

  it("updates a view", async () => {
    const id = store.list()[0]!.id;
    const updated = await store.update(id, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.id).toBe(id);
  });

  it("returns undefined when updating unknown id", async () => {
    expect(await store.update("unknown", { name: "X" })).toBeUndefined();
  });

  it("filters by pinned", async () => {
    const id = store.list()[0]!.id;
    expect(store.list(true)).toHaveLength(0);
    await store.update(id, { pinned: true });
    expect(store.list(true)).toHaveLength(1);
    expect(store.list(false)).toHaveLength(0);
  });

  it("deletes a view", async () => {
    const id = store.list()[0]!.id;
    expect(await store.remove(id)).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it("returns false when deleting unknown id", async () => {
    expect(await store.remove("unknown")).toBe(false);
  });

  it("persists across restores", async () => {
    await store.create({
      name: "Persistent",
      description: "",
      columns: ["number"],
      filters: {},
      sort: "sla",
      sortDir: "asc",
      groupBy: null,
      pinned: false,
    });
    const store2 = new ViewStore(path.join(dir, "views.json"));
    await store2.restore();
    expect(store2.list()).toHaveLength(1);
    expect(store2.list()[0]!.name).toBe("Persistent");
  });
});
