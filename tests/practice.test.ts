import { describe, expect, it } from "vitest";
import { sortPracticeCards, practiceStats } from "../src/core/practice/index.js";
import { confidenceUpdateSchema } from "../src/schemas/practice.js";

const cards = [
  { card: { id: "f1", front: "1", back: "a", requirement_ids: [] }, internalId: "flashcard-1", order: 0 },
  { card: { id: "f2", front: "2", back: "a", requirement_ids: [] }, internalId: "flashcard-2", order: 1 },
  { card: { id: "f3", front: "3", back: "a", requirement_ids: [] }, internalId: "flashcard-3", order: 2 },
];

describe("flashcard practice ordering", () => {
  it("keeps first-session order stable", () => expect(sortPracticeCards(cards, [])).toEqual(["flashcard-1", "flashcard-2", "flashcard-3"]));
  it("prioritizes weak confidence and unpracticed cards", () => expect(sortPracticeCards(cards, [
    { flashcardInternalId: "flashcard-1", confidence: 3, practiceCount: 1, lastPracticedAt: "2026-09-10T00:00:00.000Z" },
    { flashcardInternalId: "flashcard-2", confidence: 1, practiceCount: 1, lastPracticedAt: "2026-09-10T00:00:00.000Z" },
    { flashcardInternalId: "flashcard-3", confidence: 2, practiceCount: 1, lastPracticedAt: "2026-09-10T00:00:00.000Z" },
  ])).toEqual(["flashcard-2", "flashcard-3", "flashcard-1"]));
  it("uses least-recently-practiced as the confidence tie breaker", () => expect(sortPracticeCards(cards, [
    { flashcardInternalId: "flashcard-1", confidence: 1, practiceCount: 1, lastPracticedAt: "2026-09-10T00:00:00.000Z" },
    { flashcardInternalId: "flashcard-2", confidence: 1, practiceCount: 1, lastPracticedAt: "2026-09-01T00:00:00.000Z" },
  ])).toEqual(["flashcard-3", "flashcard-2", "flashcard-1"]));
});

describe("practice stats and validation", () => {
  it("counts zero cards and mixed confidence states correctly", () => {
    expect(practiceStats([]).total).toBe(0);
    expect(practiceStats(cards.map((item, index) => ({ ...item.card, internalId: item.internalId, confidence: index === 0 ? 1 : index === 1 ? null : 3, practiceCount: 1, lastPracticedAt: null })))).toMatchObject({ total: 3, practiced: 2, unpracticed: 1, lowConfidence: 1, mediumConfidence: 0, highConfidence: 1 });
  });
  it("accepts only confidence values one through three", () => {
    expect(confidenceUpdateSchema.safeParse({ confidence: 1 }).success).toBe(true);
    expect(confidenceUpdateSchema.safeParse({ confidence: 0 }).success).toBe(false);
    expect(confidenceUpdateSchema.safeParse({ confidence: 4 }).success).toBe(false);
    expect(confidenceUpdateSchema.safeParse({ confidence: "high" }).success).toBe(false);
    expect(confidenceUpdateSchema.safeParse({ confidence: 1.5 }).success).toBe(false);
  });
});
