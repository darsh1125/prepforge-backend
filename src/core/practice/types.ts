import type { Flashcard } from "../../schemas/kit.js";

export type Confidence = 1 | 2 | 3;
export type PracticeState = { flashcardInternalId: string; confidence: Confidence | null; practiceCount: number; lastPracticedAt: string | null };
export type PracticeCard = Flashcard & { internalId: string; confidence: Confidence | null; practiceCount: number; lastPracticedAt: string | null };
export type PracticeStats = { total: number; practiced: number; unpracticed: number; lowConfidence: number; mediumConfidence: number; highConfidence: number };
