import type { LLMClient } from "../../llm/client.js";
import { buildFlashcardRequest } from "./prompts.js";
import { normalizeFlashcards } from "./normalize.js";
import type { FlashcardContext, FlashcardGenerationResult } from "./types.js";

function assignIds(cards: ReturnType<typeof normalizeFlashcards>) {
  return cards.map((card, index) => ({ ...card, id: `f${index + 1}` }));
}

export async function generateFlashcards(context: FlashcardContext, client: LLMClient): Promise<FlashcardGenerationResult> {
  if (context.requirements.length === 0) return { flashcards: [], metadata: [], warnings: [], ok: true };
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await client.generateStructured<unknown>(buildFlashcardRequest(context, lastError || undefined));
      const flashcards = assignIds(normalizeFlashcards(raw, context.requirements));
      return { flashcards, metadata: flashcards.map((card) => ({ internalKey: `flashcard-${card.id}`, origin: "generated", edited: false, pinned: false })), warnings: [], ok: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "FLASHCARD_GENERATION_FAILED";
      if (lastError === "LLM_RATE_LIMITED" || lastError === "LLM_UNAVAILABLE") break;
    }
  }
  return { flashcards: [], metadata: [], warnings: [{ code: "FLASHCARD_GENERATION_FAILED", message: "Could not generate valid flashcards after one repair attempt", recoverable: true }], ok: false };
}

export type { FlashcardContext, FlashcardGenerationResult } from "./types.js";
