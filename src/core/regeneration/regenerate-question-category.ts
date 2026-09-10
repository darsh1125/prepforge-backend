import { generateCategoryQuestions } from "../generation/questions/index.js";
import { createGeneratedMetadata, nextExportId, normalizeMetadata } from "../builder/state.js";
import { checkCoverage } from "../coverage/check-coverage.js";
import { generateGapQuestions } from "../coverage/fill-gaps.js";
import type { Question, QuestionCategory } from "../../schemas/kit.js";
import type { LLMClient } from "../llm/client.js";
import type { QuestionRegenerationInput, QuestionRegenerationResult } from "./types.js";
import { dedupeRegeneratedQuestions, partitionQuestions } from "./preservation.js";

export async function regenerateQuestionCategory(input: QuestionRegenerationInput, client: LLMClient): Promise<QuestionRegenerationResult> {
  const partition = partitionQuestions(input.questions, input.metadata, input.category);
  const preservedIds = new Set(partition.preserved.flatMap((question) => question.requirement_ids));
  const targetRequirements = input.requirements.filter((requirement) => !preservedIds.has(requirement.id));
  const generated = await generateCategoryQuestions(input.category, { role: input.role, requirements: targetRequirements.length ? targetRequirements : input.requirements, companyResearch: input.companyResearch, interviewResearch: input.interviewResearch, preservedQuestionPrompts: partition.preserved.map((question) => question.prompt), targetRequirementIds: targetRequirements.map((requirement) => requirement.id) }, client);
  if (generated.warnings.some((warning) => warning.code === "QUESTION_CATEGORY_GENERATION_FAILED")) throw new Error("QUESTION_CATEGORY_GENERATION_FAILED");
  let candidates = generated.questions.map((question, index) => ({ ...question, id: `candidate-${index + 1}`, category: input.category }));
  let warnings = generated.warnings.map((warning) => ({ code: warning.code, message: warning.message }));
  const before = checkCoverage(input.requirements, input.questions);
  const afterFirst = checkCoverage(input.requirements, [...partition.other, ...partition.preserved, ...candidates]);
  const inducedMust = afterFirst.uncoveredMustRequirementIds.filter((id) => !before.uncoveredMustRequirementIds.includes(id));
  if (inducedMust.length) {
    const gaps = await generateGapQuestions(input.role, input.requirements.filter((requirement) => inducedMust.includes(requirement.id)), [...partition.other, ...partition.preserved], client);
    candidates = [...candidates, ...gaps.questions.filter((question) => question.category === input.category)]; warnings = [...warnings, ...gaps.warnings.map((warning) => ({ code: warning.code, message: warning.message }))];
  }
  candidates = dedupeRegeneratedQuestions(candidates, [...partition.other, ...partition.preserved]);
  const deletedIds = [...(input.deletedQuestionIds ?? []), ...input.questions.filter((question) => question.category === input.category && !partition.preserved.some((item) => item.id === question.id)).map((question) => question.id)];
  const usedIds = new Set(input.questions.map((question) => question.id));
  const allMetadata = normalizeMetadata(input.questions, input.metadata, "q");
  let nextId = nextExportId(input.questions, deletedIds, "q");
  const newItems: Question[] = [];
  for (const question of candidates) { while (usedIds.has(nextId)) nextId = nextExportId([...input.questions, ...newItems], [...deletedIds, nextId], "q"); const item = { ...question, id: nextId }; newItems.push(item); usedIds.add(nextId); nextId = nextExportId([...input.questions, ...newItems], [...deletedIds, nextId], "q"); }
  const preservedAndOther = [...partition.other, ...partition.preserved];
  const questions = [...preservedAndOther, ...newItems];
  const metadata = normalizeMetadata(questions, allMetadata, "q");
  for (const item of newItems) metadata[metadata.findIndex((entry) => entry.id === item.id)] = createGeneratedMetadata(item.id, "q", metadata.length);
  return { questions, metadata, preserved: partition.preserved, replacedCount: partition.replaceable.length, warnings };
}

export type { QuestionCategory };
