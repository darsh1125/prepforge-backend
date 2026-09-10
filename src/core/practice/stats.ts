import type { PracticeCard, PracticeStats } from "./types.js";

export function practiceStats(cards: PracticeCard[]): PracticeStats {
  return { total: cards.length, practiced: cards.filter((card) => card.confidence !== null).length, unpracticed: cards.filter((card) => card.confidence === null).length, lowConfidence: cards.filter((card) => card.confidence === 1).length, mediumConfidence: cards.filter((card) => card.confidence === 2).length, highConfidence: cards.filter((card) => card.confidence === 3).length };
}
