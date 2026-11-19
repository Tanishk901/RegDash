import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type FeedbackAction = "accept" | "dismiss" | "flag";

export interface SuggestionFeedback {
  id: string;
  ticketNumber: string;
  suggestionId: string;
  action: FeedbackAction;
  by: string;
  at: string;
}

export class FeedbackStore {
  private items: Map<string, SuggestionFeedback> = new Map();

  constructor(private filePath: string = "../../data/feedback.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const arr: SuggestionFeedback[] = JSON.parse(raw);
      this.items = new Map(arr.map((f) => [f.id, f]));
    } catch {
      this.items = new Map();
    }
  }

  async record(ticketNumber: string, suggestionId: string, action: FeedbackAction, by: string): Promise<SuggestionFeedback> {
    const fb: SuggestionFeedback = {
      id: randomUUID(),
      ticketNumber,
      suggestionId,
      action,
      by,
      at: new Date().toISOString(),
    };
    this.items.set(fb.id, fb);
    await this.persist();
    return fb;
  }

  forTicket(ticketNumber: string): SuggestionFeedback[] {
    return [...this.items.values()].filter((f) => f.ticketNumber === ticketNumber);
  }

  all(): SuggestionFeedback[] {
    return [...this.items.values()];
  }

  stats(): { total: number; byAction: Record<FeedbackAction, number> } {
    const byAction: Record<FeedbackAction, number> = { accept: 0, dismiss: 0, flag: 0 };
    for (const f of this.items.values()) byAction[f.action]++;
    return { total: this.items.size, byAction };
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
