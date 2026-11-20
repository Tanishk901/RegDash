import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  body: string;
  templateId: string | null;
  ticketNumber: string | null;
  trigger: "manual" | "bulk" | "auto_reminder" | "auto_welcome" | "auto_ack";
  status: "sent" | "failed";
  error: string | null;
  messageId: string | null;
  sentAt: string;
  sentBy: string | null;
}

export type EmailLogInput = Omit<EmailLogEntry, "id">;

export class EmailLogStore {
  private entries: EmailLogEntry[] = [];

  constructor(private filePath: string = "../../data/email-log.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.entries = JSON.parse(raw);
    } catch {
      this.entries = [];
    }
  }

  all(): EmailLogEntry[] {
    return [...this.entries];
  }

  recent(limit = 50): EmailLogEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  byTicket(ticketNumber: string): EmailLogEntry[] {
    return this.entries.filter((e) => e.ticketNumber === ticketNumber);
  }

  async add(input: EmailLogInput): Promise<EmailLogEntry> {
    const entry: EmailLogEntry = { ...input, id: randomUUID() };
    this.entries.push(entry);
    await this.persist();
    return entry;
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify(this.entries, null, 2);
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
