import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { KnowledgeChunk, KnowledgeSearchResult, KnowledgeStore, KnowledgeStoreStatus } from "./KnowledgeStore";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private chunks: Map<string, KnowledgeChunk> = new Map();
  private lastIndexedAt: string | null = null;

  constructor(private filePath: string = "../../data/knowledge.json") {
    this.filePath = path.resolve(filePath);
  }

  async restore(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as { chunks: KnowledgeChunk[]; lastIndexedAt: string | null };
      this.chunks = new Map(data.chunks.map((c) => [c.id, c]));
      this.lastIndexedAt = data.lastIndexedAt;
    } catch {
      this.chunks = new Map();
    }
  }

  async add(chunks: KnowledgeChunk[]): Promise<void> {
    for (const c of chunks) this.chunks.set(c.id, c);
    this.lastIndexedAt = new Date().toISOString();
    await this.persist();
  }

  async search(queryVector: number[], topK = 5): Promise<KnowledgeSearchResult[]> {
    const scored: KnowledgeSearchResult[] = [];
    for (const chunk of this.chunks.values()) {
      scored.push({ chunk, score: cosineSimilarity(queryVector, chunk.vector) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async reindex(chunks: KnowledgeChunk[]): Promise<void> {
    this.chunks.clear();
    for (const c of chunks) this.chunks.set(c.id, c);
    this.lastIndexedAt = new Date().toISOString();
    await this.persist();
  }

  status(): KnowledgeStoreStatus {
    const bySources: Record<string, number> = {};
    for (const c of this.chunks.values()) {
      bySources[c.source] = (bySources[c.source] ?? 0) + 1;
    }
    return { totalChunks: this.chunks.size, bySources, lastIndexedAt: this.lastIndexedAt };
  }

  allChunks(): KnowledgeChunk[] {
    return [...this.chunks.values()];
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify({ chunks: [...this.chunks.values()], lastIndexedAt: this.lastIndexedAt }, null, 2);
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
