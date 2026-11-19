export interface KnowledgeChunk {
  id: string;
  source: "sop" | "ticket";
  title: string;
  content: string;
  vector: number[];
  metadata: Record<string, string>;
}

export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

export interface KnowledgeStoreStatus {
  totalChunks: number;
  bySources: Record<string, number>;
  lastIndexedAt: string | null;
}

export interface KnowledgeStore {
  add(chunks: KnowledgeChunk[]): Promise<void>;
  search(queryVector: number[], topK?: number): Promise<KnowledgeSearchResult[]>;
  reindex(chunks: KnowledgeChunk[]): Promise<void>;
  status(): KnowledgeStoreStatus;
  allChunks(): KnowledgeChunk[];
}
