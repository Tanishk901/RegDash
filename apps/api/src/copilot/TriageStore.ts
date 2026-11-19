import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TriageSuggestion } from "./TriageEngine";

export class TriageStore {
  private items: Map<string, TriageSuggestion> = new Map();

  constructor(private filePath: string = "../../data/triage.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const arr: TriageSuggestion[] = JSON.parse(raw);
      this.items = new Map(arr.map((s) => [s.id, s]));
    } catch {
      this.items = new Map();
    }
  }

  async add(partial: Omit<TriageSuggestion, "id" | "status" | "createdAt" | "reviewedAt" | "reviewedBy">): Promise<TriageSuggestion> {
    const item: TriageSuggestion = {
      ...partial,
      id: randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
    };
    this.items.set(item.id, item);
    await this.persist();
    return item;
  }

  queue(status?: "pending" | "approved" | "rejected"): TriageSuggestion[] {
    const all = [...this.items.values()];
    if (!status) return all;
    return all.filter((s) => s.status === status);
  }

  get(id: string): TriageSuggestion | undefined {
    return this.items.get(id);
  }

  async approve(id: string, by: string): Promise<TriageSuggestion | undefined> {
    const item = this.items.get(id);
    if (!item) return undefined;
    item.status = "approved";
    item.reviewedAt = new Date().toISOString();
    item.reviewedBy = by;
    await this.persist();
    return item;
  }

  async reject(id: string, by: string): Promise<TriageSuggestion | undefined> {
    const item = this.items.get(id);
    if (!item) return undefined;
    item.status = "rejected";
    item.reviewedAt = new Date().toISOString();
    item.reviewedBy = by;
    await this.persist();
    return item;
  }

  stats(): { total: number; pending: number; approved: number; rejected: number; accuracy: number } {
    const all = [...this.items.values()];
    const total = all.length;
    const pending = all.filter((s) => s.status === "pending").length;
    const approved = all.filter((s) => s.status === "approved").length;
    const rejected = all.filter((s) => s.status === "rejected").length;
    const reviewed = approved + rejected;
    const accuracy = reviewed > 0 ? Math.round((approved / reviewed) * 100) / 100 : 0;
    return { total, pending, approved, rejected, accuracy };
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify([...this.items.values()], null, 2);
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
