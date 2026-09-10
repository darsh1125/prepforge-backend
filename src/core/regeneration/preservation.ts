import type { Question } from "../../schemas/kit.js";
import type { EditorItemMetadata } from "../builder/types.js";

export function isPreserved(entry: EditorItemMetadata): boolean { return entry.origin === "user" || entry.edited || entry.pinned; }
export function partitionQuestions(questions: Question[], metadata: EditorItemMetadata[], category: Question["category"]): { preserved: Question[]; replaceable: Question[]; other: Question[] } {
  const byId = new Map(metadata.map((entry) => [entry.id, entry]));
  const preserved: Question[] = []; const replaceable: Question[] = []; const other: Question[] = [];
  for (const question of questions) {
    if (question.category !== category) { other.push(question); continue; }
    if (isPreserved(byId.get(question.id) ?? { origin: "generated", edited: false, pinned: false, id: question.id, internalId: question.id, order: 0 })) preserved.push(question);
    else replaceable.push(question);
  }
  return { preserved, replaceable, other };
}

export function dedupeRegeneratedQuestions(questions: Question[], preserved: Question[]): Question[] {
  const key = (question: Question) => question.prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const seen = new Set(preserved.map(key));
  return questions.filter((question) => { const value = key(question); if (seen.has(value)) return false; seen.add(value); return true; });
}
