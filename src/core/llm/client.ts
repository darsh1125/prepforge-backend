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

import { loadEnv } from "../../config/env.js";

export class OpenAIChatClient implements LLMClient {
  async generateStructured<T>(request: StructuredGenerationRequest): Promise<T> {
    const env = loadEnv();
    if (!env.LLM_API_KEY) throw new Error("LLM_UNAVAILABLE");
    const response = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model: env.LLM_MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: request.instructions }, { role: "user", content: JSON.stringify(request.input) }] }),
    });
    if (response.status === 429) throw new Error("LLM_RATE_LIMITED");
    if (!response.ok) throw new Error("LLM_UNAVAILABLE");
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM_INVALID_RESPONSE");
    try { return JSON.parse(content) as T; } catch { throw new Error("LLM_INVALID_RESPONSE"); }
  }
}

export function createLLMClient(): LLMClient {
  return new OpenAIChatClient();
}
