import type { Flashcard, Question } from "../../schemas/kit.js";

export type ItemOrigin = "generated" | "user";
export type EditorItemMetadata = { internalId: string; id: string; origin: ItemOrigin; edited: boolean; pinned: boolean; order: number };
export type BuilderDerivedState = { coverageStale: boolean; scheduleStale: boolean; updatedAt: string };
export type BuilderState = { questions: Question[]; questionMetadata: EditorItemMetadata[]; flashcards: Flashcard[]; flashcardMetadata: EditorItemMetadata[]; derivedState: BuilderDerivedState };
