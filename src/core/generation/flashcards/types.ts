import type { Question, Requirement, Role } from "../../../schemas/kit.js";

export type FlashcardDraft = { front: string; back: string; requirement_ids: string[] };
export type GeneratedFlashcard = FlashcardDraft & { id: string };
export type FlashcardMetadata = { internalKey: string; origin: "generated"; edited: boolean; pinned: boolean };
export type FlashcardWarning = { code: string; message: string; recoverable: boolean };
export type FlashcardContext = { role: Role; requirements: Requirement[]; questions: Question[] };
export type FlashcardGenerationResult = { flashcards: GeneratedFlashcard[]; metadata: FlashcardMetadata[]; warnings: FlashcardWarning[]; ok: boolean };
