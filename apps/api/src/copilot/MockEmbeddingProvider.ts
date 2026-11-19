import type { EmbeddingProvider } from "./EmbeddingProvider";

const DIMS = 64;

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function deterministicVector(text: string): number[] {
  const seed = hashCode(text.toLowerCase().trim());
  const vec: number[] = [];
  let s = seed;
  for (let i = 0; i < DIMS; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    vec.push(((s >>> 0) / 4294967296) * 2 - 1);
  }
  const mag = Math.sqrt(vec.reduce((a, v) => a + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  readonly dimensions = DIMS;

  async embed(text: string): Promise<number[]> {
    return deterministicVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(deterministicVector);
  }
}
