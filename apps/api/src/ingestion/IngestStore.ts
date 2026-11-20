import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IngestDraft, IngestDraftStatus } from "@regdash/shared";

export interface IngestEmailInput {
  emailFrom: string;
  emailSubject: string;
  emailBody: string;
  emailReceivedAt: string;
  classification: IngestDraft["classification"];
  classificationReason: string;
  draftType: IngestDraft["draftType"];
  draftShortDescription: string;
  draftDescription: string;
  draftPriority: IngestDraft["draftPriority"];
}

export class IngestStore {
  private drafts: Map<string, IngestDraft> = new Map();

  constructor(private filePath: string = "../../data/ingestion-queue.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const arr: IngestDraft[] = JSON.parse(raw);
      this.drafts = new Map(arr.map((d) => [d.id, d]));
    } catch {
      this.drafts = new Map();
    }
  }

  all(): IngestDraft[] {
    return [...this.drafts.values()];
  }

  queue(status?: IngestDraftStatus): IngestDraft[] {
    const items = this.all();
    if (!status) return items;
    return items.filter((d) => d.status === status);
  }

  get(id: string): IngestDraft | undefined {
    return this.drafts.get(id);
  }

  async add(input: IngestEmailInput): Promise<IngestDraft> {
    const draft: IngestDraft = {
      ...input,
      id: randomUUID(),
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdTicketNumber: null,
      createdAt: new Date().toISOString(),
    };
    this.drafts.set(draft.id, draft);
    await this.persist();
    return draft;
  }

  async approve(id: string, reviewedBy: string, ticketNumber: string): Promise<IngestDraft | undefined> {
    const draft = this.drafts.get(id);
    if (!draft || draft.status !== "pending") return undefined;
    const updated: IngestDraft = {
      ...draft,
      status: "approved",
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      createdTicketNumber: ticketNumber,
    };
    this.drafts.set(id, updated);
    await this.persist();
    return updated;
  }

  async reject(id: string, reviewedBy: string, reason: string): Promise<IngestDraft | undefined> {
    const draft = this.drafts.get(id);
    if (!draft || draft.status !== "pending") return undefined;
    const updated: IngestDraft = {
      ...draft,
      status: "rejected",
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason,
    };
    this.drafts.set(id, updated);
    await this.persist();
    return updated;
  }

  async updateDraft(id: string, fields: Partial<Pick<IngestDraft, "draftShortDescription" | "draftDescription" | "draftPriority" | "draftType">>): Promise<IngestDraft | undefined> {
    const draft = this.drafts.get(id);
    if (!draft || draft.status !== "pending") return undefined;
    const updated: IngestDraft = { ...draft, ...fields };
    this.drafts.set(id, updated);
    await this.persist();
    return updated;
  }

  stats(): { total: number; pending: number; approved: number; rejected: number } {
    let pending = 0, approved = 0, rejected = 0;
    for (const d of this.drafts.values()) {
      if (d.status === "pending") pending++;
      else if (d.status === "approved") approved++;
      else rejected++;
    }
    return { total: this.drafts.size, pending, approved, rejected };
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify([...this.drafts.values()], null, 2);
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
