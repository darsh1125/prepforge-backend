import type { QuestionCategory, Requirement } from "../../../schemas/kit.js";
import { questionDraftResponseSchema } from "./schemas.js";
import type { GeneratedQuestion, QuestionDraft } from "./types.js";

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function key(value: string): string { return clean(value).toLowerCase().replace(/^(can you|could you|please)\s+/, "").replace(/[^a-z0-9]+/g, " ").trim(); }

export function normalizeQuestions(raw: unknown, category: QuestionCategory, requirements: Requirement[]): GeneratedQuestion[] {
  const parsed = questionDraftResponseSchema.parse(raw);
  const validIds = new Set(requirements.map((requirement) => requirement.id));
  const seen = new Set<string>();
  const questions: GeneratedQuestion[] = [];
  for (const draft of parsed.questions) {
    const prompt = clean(draft.prompt); const answerOutline = clean(draft.answer_outline); const promptKey = key(prompt);
    if (draft.requirement_ids.some((id) => !validIds.has(id))) throw new Error("QUESTION_REQUIREMENT_REFERENCE_INVALID");
    const ids = [...new Set(draft.requirement_ids)].filter((id) => validIds.has(id)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (!prompt || !answerOutline || seen.has(promptKey)) continue;
    if (category !== "company-fit" && ids.length === 0) throw new Error("QUESTION_REQUIREMENT_REFERENCE_INVALID");
    seen.add(promptKey); questions.push({ id: "", category, requirement_ids: ids, prompt, answer_outline: answerOutline, difficulty: draft.difficulty });
  }
  return questions;
}
