import type { QuestionCategory, Requirement, Role } from "../../schemas/kit.js";
import { generateCategoryQuestions } from "../generation/questions/index.js";
import type { LLMClient } from "../llm/client.js";
import type { GeneratedQuestion, QuestionGenerationWarning } from "../generation/questions/types.js";

function categoryFor(requirement: Requirement): QuestionCategory {
  if (requirement.kind === "behavioural") return "behavioural";
  if (requirement.kind === "technical" && /architect|architecture|distributed|scale|system design|platform/i.test(requirement.text)) return "system-design";
  return requirement.kind === "domain" ? "company-fit" : "technical";
}

export async function generateGapQuestions(role: Role, requirements: Requirement[], existingQuestions: GeneratedQuestion[], client: LLMClient): Promise<{ questions: GeneratedQuestion[]; warnings: QuestionGenerationWarning[] }> {
  const questions: GeneratedQuestion[] = []; const warnings: QuestionGenerationWarning[] = [];
  const groups = new Map<QuestionCategory, Requirement[]>();
  for (const requirement of requirements) groups.set(categoryFor(requirement), [...(groups.get(categoryFor(requirement)) ?? []), requirement]);
  for (const [category, group] of groups) {
    try {
      const narrowedRole = { ...role, requirements: group };
      const result = await generateCategoryQuestions(category, { role: narrowedRole, requirements: group }, client);
      questions.push(...result.questions); warnings.push(...result.warnings);
    } catch (error) { warnings.push({ code: "GAP_GENERATION_PARTIAL", message: error instanceof Error ? error.message : "Targeted gap generation failed", category, recoverable: true }); }
  }
  return { questions: questions.filter((question) => !existingQuestions.some((existing) => existing.prompt.trim().toLowerCase() === question.prompt.trim().toLowerCase())), warnings };
}
