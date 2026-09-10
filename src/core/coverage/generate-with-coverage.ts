import type { QuestionCategory, Requirement } from "../../schemas/kit.js";
import { generateAllQuestions } from "../generation/questions/index.js";
import type { GeneratedQuestion, QuestionGenerationContext, QuestionGenerationWarning, QuestionMetadata } from "../generation/questions/types.js";
import type { LLMClient } from "../llm/client.js";
import { checkCoverage } from "./check-coverage.js";
import { generateGapQuestions } from "./fill-gaps.js";
import type { CoverageOutput, CoverageResult, CoverageStatus } from "./types.js";

function fallback(requirement: Requirement, id: string): GeneratedQuestion {
  const category: QuestionCategory = requirement.kind === "behavioural" ? "behavioural" : requirement.kind === "domain" ? "company-fit" : "technical";
  const prompt = category === "behavioural" ? `Tell me about a time you demonstrated ${requirement.text}.` : category === "company-fit" ? `How has your experience with ${requirement.text} influenced a technical or product decision?` : `Describe your experience with ${requirement.text} and a challenging problem you solved using it.`;
  const answer_outline = category === "behavioural" ? "Use STAR: situation, responsibility, actions, measurable result, and what you learned." : `Discuss the relevant context, decisions, trade-offs, outcome, and lessons related to ${requirement.text}.`;
  return { id, requirement_ids: [requirement.id], category, prompt, answer_outline, difficulty: requirement.priority === "must" ? 2 : 1 };
}

function renumber(questions: GeneratedQuestion[]): GeneratedQuestion[] { return questions.map((question, index) => ({ ...question, id: `q${index + 1}` })); }
function dedupe(questions: GeneratedQuestion[]): GeneratedQuestion[] { const seen = new Set<string>(); return questions.filter((question) => { const key = question.prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (seen.has(key)) return false; seen.add(key); return true; }); }

export type QuestionsWithCoverageResult = { questions: GeneratedQuestion[]; metadata: QuestionMetadata[]; warnings: QuestionGenerationWarning[]; coverage: CoverageOutput; diagnostics: CoverageResult; status: CoverageStatus };

export async function generateQuestionsWithCoverage(context: QuestionGenerationContext, client: LLMClient): Promise<QuestionsWithCoverageResult> {
  const first = generateAllQuestions(context, client); const initial = await first;
  let questions = renumber(dedupe(initial.questions));
  let diagnostics = checkCoverage(context.requirements, questions);
  const warnings: QuestionGenerationWarning[] = [...initial.warnings];
  let passes = 1;
  let fallbackUsed = false;
  if (diagnostics.uncoveredRequirementIds.length > 0) {
    passes = 2;
    warnings.push({ code: "COVERAGE_GAPS_FOUND", message: `${diagnostics.uncoveredRequirementIds.length} requirements were uncovered after the first pass`, recoverable: true });
    const gaps = await generateGapQuestions(context.role, context.requirements.filter((requirement) => diagnostics.uncoveredRequirementIds.includes(requirement.id)), questions, client);
    warnings.push(...gaps.warnings); questions = renumber(dedupe([...questions, ...gaps.questions])); diagnostics = checkCoverage(context.requirements, questions);
  }
  if (diagnostics.uncoveredMustRequirementIds.length > 0) {
    fallbackUsed = true;
    for (const requirementId of diagnostics.uncoveredMustRequirementIds) { const requirement = context.requirements.find((candidate) => candidate.id === requirementId); if (requirement) { questions.push(fallback(requirement, "")); warnings.push({ code: "MUST_REQUIREMENT_FALLBACK_USED", message: `Used a deterministic fallback for ${requirement.id}`, recoverable: true }); } }
    questions = renumber(dedupe(questions)); diagnostics = checkCoverage(context.requirements, questions);
  }
  if (diagnostics.uncoveredNiceRequirementIds.length > 0) warnings.push({ code: "NICE_REQUIREMENTS_UNCOVERED", message: "One or more nice-to-have requirements remain uncovered", recoverable: true });
  const metadata = questions.map((question) => ({ internalKey: `${question.category}-${question.id}`, origin: "generated" as const, edited: false, pinned: false }));
  if (fallbackUsed) passes = 3;
  const status: CoverageStatus = diagnostics.uncoveredMustRequirementIds.length > 0 ? "FAILURE" : diagnostics.uncoveredRequirementIds.length > 0 ? "PARTIAL_SUCCESS" : "FULL_SUCCESS";
  return { questions, metadata, warnings, coverage: { uncovered_requirement_ids: diagnostics.uncoveredRequirementIds, passes }, diagnostics, status };
}
