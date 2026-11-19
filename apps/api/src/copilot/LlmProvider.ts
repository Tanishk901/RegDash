export interface LlmCitation {
  chunkId: string;
  title: string;
  snippet: string;
}

export interface LlmAnswer {
  answer: string;
  citations: LlmCitation[];
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  generateAnswer(prompt: string, context: string[]): Promise<LlmAnswer>;
}
