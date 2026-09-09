/**
 * LLM provider boundary. No provider is wired in Prompt 1.
 * Future stages must call this interface with specialized prompts —
 * never a single giant prompt for the entire kit.
 *
 * Deterministic work (coverage, scheduling, IDs, validation) must
 * stay in TypeScript and must not go through this client.
 */

export type StructuredGenerationRequest = {
  purpose: string;
  instructions: string;
  input: unknown;
};

export interface LLMClient {
  generateStructured<T>(request: StructuredGenerationRequest): Promise<T>;
}

export class NotImplementedLLMClient implements LLMClient {
  async generateStructured<T>(_request: StructuredGenerationRequest): Promise<T> {
    throw new Error("LLM client is not configured yet");
  }
}
