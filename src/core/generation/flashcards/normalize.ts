import type { Requirement } from "../../../schemas/kit.js";
import { flashcardDraftResponseSchema } from "./schemas.js";
import type { FlashcardDraft } from "./types.js";

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function key(value: string): string { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

export function normalizeFlashcards(raw: unknown, requirements: Requirement[]): FlashcardDraft[] {
  const parsed = flashcardDraftResponseSchema.parse(raw);
  const validIds = new Set(requirements.map((requirement) => requirement.id));
  const seen = new Set<string>();
  const cards: FlashcardDraft[] = [];
  for (const draft of parsed.flashcards) {
    const ids = [...new Set(draft.requirement_ids)].sort();
    const invalid = ids.filter((id) => !validIds.has(id));
    if (invalid.length > 0) throw new Error(`FLASHCARD_REQUIREMENT_REFERENCE_INVALID:${invalid.join(",")}`);
    const front = clean(draft.front); const back = clean(draft.back); const cardKey = `${key(front)}|${key(back)}`;
    if (!front || !back || seen.has(cardKey)) continue;
    seen.add(cardKey); cards.push({ front, back, requirement_ids: ids });
  }
  return cards;
}
