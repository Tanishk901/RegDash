import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailTemplate, EmailTemplateInput } from "@regdash/shared";

export class TemplateStore {
  private templates: Map<string, EmailTemplate> = new Map();

  constructor(private filePath: string = "../../data/templates.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const arr: EmailTemplate[] = JSON.parse(raw);
      this.templates = new Map(arr.map((t) => [t.id, t]));
    } catch {
      this.templates = new Map();
    }
  }

  all(): EmailTemplate[] {
    return [...this.templates.values()];
  }

  get(id: string): EmailTemplate | undefined {
    return this.templates.get(id);
  }

  async create(input: EmailTemplateInput): Promise<EmailTemplate> {
    const now = new Date().toISOString();
    const template: EmailTemplate = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(template.id, template);
    await this.persist();
    return template;
  }

  async update(id: string, input: Partial<EmailTemplateInput>): Promise<EmailTemplate | undefined> {
    const existing = this.templates.get(id);
    if (!existing) return undefined;
    const updated: EmailTemplate = {
      ...existing,
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.templates.set(id, updated);
    await this.persist();
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.templates.delete(id);
    if (deleted) await this.persist();
    return deleted;
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify([...this.templates.values()], null, 2);
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
