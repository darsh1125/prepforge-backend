import { randomUUID } from "node:crypto";
import type { Flashcard, Question } from "../../schemas/kit.js";
import type { EditorItemMetadata, ItemOrigin } from "./types.js";

function numericId(id: string, prefix: string): number { const match = new RegExp(`^${prefix}(\\d+)$`).exec(id); return match ? Number(match[1]) : 0; }

export function normalizeMetadata(items: (Question | Flashcard)[], metadata: unknown, prefix: "q" | "f"): EditorItemMetadata[] {
  const saved = Array.isArray(metadata) ? metadata as (Partial<EditorItemMetadata> & { internalKey?: string })[] : [];
  return items.map((item, index) => {
    const existing = saved.find((entry) => entry.id === item.id || entry.internalKey?.endsWith(`-${item.id}`));
    return { internalId: existing?.internalId ?? `${prefix === "q" ? "question" : "flashcard"}-${item.id}`, id: item.id, origin: existing?.origin ?? "generated", edited: existing?.edited ?? false, pinned: existing?.pinned ?? false, order: typeof existing?.order === "number" ? existing.order : index };
  });
}

export function nextExportId(items: (Question | Flashcard)[], deletedIds: string[], prefix: "q" | "f"): string {
  const highest = [...items.map((item) => item.id), ...deletedIds].reduce((max, id) => Math.max(max, numericId(id, prefix)), 0);
  return `${prefix}${highest + 1}`;
}

export function createMetadata(id: string, prefix: "q" | "f", origin: ItemOrigin, order: number): EditorItemMetadata {
  return { internalId: `${prefix === "q" ? "question" : "flashcard"}-${randomUUID()}`, id, origin, edited: true, pinned: false, order };
}

export function hasQuestionContentChanged(before: Question, after: Question): boolean {
  return before.prompt !== after.prompt || before.answer_outline !== after.answer_outline || before.difficulty !== after.difficulty || before.category !== after.category || before.requirement_ids.join(",") !== after.requirement_ids.join(",");
}

export function sortByMetadata<T extends Question | Flashcard>(items: T[], metadata: EditorItemMetadata[]): T[] {
  const order = new Map(metadata.map((entry) => [entry.id, entry.order]));
  return [...items].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}
