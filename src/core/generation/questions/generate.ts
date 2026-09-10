import type { QuestionCategory, Requirement, Role } from "../../../schemas/kit.js";
import { AppError } from "../../errors/appError.js";
import { createLLMClient, type LLMClient } from "../../llm/client.js";
import { buildQuestionRequest } from "./prompts.js";
import { normalizeQuestions } from "./normalize.js";
import type { GeneratedQuestion, QuestionGenerationContext, QuestionGenerationResult, QuestionMetadata } from "./types.js";
import { questionSchema } from "../../../schemas/kit.js";

function shouldSkip(category: QuestionCategory, role: Role, requirements: Requirement[], context: QuestionGenerationContext): string | undefined {
  if (["technical", "behavioural", "system-design"].includes(category) && requirements.length === 0) return "NO_REQUIREMENTS_FOR_QUESTION_GENERATION";
  if (category === "technical" && !requirements.some((requirement) => requirement.kind === "technical")) return "NO_TECHNICAL_REQUIREMENTS";
  if (category === "behavioural" && requirements.filter((requirement) => requirement.kind === "behavioural").length === 0 && role.responsibilities.length === 0) return "NO_BEHAVIOURAL_SIGNAL";
  if (category === "system-design" && !/(architect|architecture|distributed|scale|scalable|system design|services|platform)/i.test(`${role.title} ${role.seniority} ${requirements.map((requirement) => requirement.text).join(" ")}`)) return "NO_SYSTEM_DESIGN_SIGNAL";
  if (category === "company-fit" && !context.companyResearch?.pages?.length && !context.interviewResearch?.sources.length) return "NO_COMPANY_RESEARCH";
  return undefined;
}

export async function generateCategoryQuestions(category: QuestionCategory, context: QuestionGenerationContext, client: LLMClient = createLLMClient()): Promise<QuestionGenerationResult> {
  const skip = shouldSkip(category, context.role, context.requirements, context);
  if (skip) return { questions: [], metadata: [], warnings: [{ code: skip, message: `Skipped ${category} question generation because supporting context is unavailable`, category, recoverable: true }] };
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await client.generateStructured<unknown>(buildQuestionRequest(category, context, lastError || undefined));
      const questions = normalizeQuestions(raw, category, context.requirements);
      return { questions, metadata: questions.map((_question, index) => ({ internalKey: `${category}-${index + 1}`, origin: "generated", edited: false, pinned: false })), warnings: [] };
    } catch (error) {
      const code = error instanceof Error ? error.message : "QUESTION_CATEGORY_GENERATION_FAILED";
      if (code === "LLM_UNAVAILABLE" || code === "LLM_RATE_LIMITED") throw new AppError(code, `Question provider unavailable for ${category}`, 503, { expose: true });
      lastError = code;
    }
  }
  return { questions: [], metadata: [], warnings: [{ code: "QUESTION_CATEGORY_GENERATION_FAILED", message: `Could not generate valid ${category} questions after one repair attempt`, category, recoverable: true }] };
}

export async function generateAllQuestions(context: QuestionGenerationContext, client: LLMClient = createLLMClient()): Promise<QuestionGenerationResult> {
  const categories: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];
  const questions: GeneratedQuestion[] = []; const metadata: QuestionMetadata[] = []; const warnings = [] as QuestionGenerationResult["warnings"];
  for (const category of categories) {
    try {
      const result = await generateCategoryQuestions(category, context, client);
      for (const question of result.questions) { question.id = `q${questions.length + 1}`; questionSchema.parse(question); questions.push(question); }
      metadata.push(...result.metadata);
      warnings.push(...result.warnings);
    } catch (error) {
      warnings.push({ code: error instanceof AppError ? error.code : "QUESTION_CATEGORY_GENERATION_FAILED", message: error instanceof Error ? error.message : "Question category generation failed", category, recoverable: true });
    }
  }
  return { questions, metadata, warnings };
}
