import type { Flashcard } from "../../schemas/kit.js";
import type { PracticeState } from "./types.js";

export function sortPracticeCards(cards: { card: Flashcard; internalId: string; order: number }[], states: PracticeState[]): string[] {
  const byId = new Map(states.map((state) => [state.flashcardInternalId, state]));
  return [...cards].sort((left, right) => {
    const a = byId.get(left.internalId); const b = byId.get(right.internalId);
    const aUnpracticed = a?.confidence == null ? 0 : 1; const bUnpracticed = b?.confidence == null ? 0 : 1;
    if (aUnpracticed !== bUnpracticed) return aUnpracticed - bUnpracticed;
    if ((a?.confidence ?? 0) !== (b?.confidence ?? 0)) return (a?.confidence ?? 0) - (b?.confidence ?? 0);
    const aTime = a?.lastPracticedAt ? Date.parse(a.lastPracticedAt) : 0; const bTime = b?.lastPracticedAt ? Date.parse(b.lastPracticedAt) : 0;
    if (aTime !== bTime) return aTime - bTime;
    return left.order - right.order || left.internalId.localeCompare(right.internalId);
  }).map((item) => item.internalId);
}
