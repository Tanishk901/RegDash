import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedView, SavedViewInput } from "@regdash/shared";

export class ViewStore {
  private views: Map<string, SavedView> = new Map();

  constructor(private filePath: string = "../../data/views.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const arr: SavedView[] = JSON.parse(raw);
      this.views = new Map(arr.map((v) => [v.id, v]));
    } catch {
      this.views = new Map();
    }
  }

  list(pinned?: boolean): SavedView[] {
    const all = [...this.views.values()];
    if (pinned === undefined) return all;
    return all.filter((v) => v.pinned === pinned);
  }

  get(id: string): SavedView | undefined {
    return this.views.get(id);
  }

  async create(input: SavedViewInput): Promise<SavedView> {
    const now = new Date().toISOString();
    const view: SavedView = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.views.set(view.id, view);
    await this.persist();
    return view;
  }

  async update(id: string, partial: Partial<SavedViewInput>): Promise<SavedView | undefined> {
    const existing = this.views.get(id);
    if (!existing) return undefined;
    const updated: SavedView = {
      ...existing,
      ...partial,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.views.set(id, updated);
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const deleted = this.views.delete(id);
    if (deleted) await this.persist();
    return deleted;
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify([...this.views.values()], null, 2);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, data, "utf8");
      await rename(tmp, this.filePath);
    } finally {
      await rm(tmp, { force: true });
    }
  }
}
