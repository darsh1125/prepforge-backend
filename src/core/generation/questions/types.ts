import type { QuestionCategory, Requirement, Role } from "../../../schemas/kit.js";
import type { InterviewResearchResult } from "../../research/types.js";

export type QuestionGenerationContext = {
  role: Role;
  requirements: Requirement[];
  companyResearch?: { companyNameHint?: string; pages?: { title: string; text: string; url: string }[] };
  interviewResearch?: InterviewResearchResult;
  preservedQuestionPrompts?: string[];
  targetRequirementIds?: string[];
};

export type QuestionDraft = { requirement_ids: string[]; prompt: string; answer_outline: string; difficulty: number };
export type GeneratedQuestion = QuestionDraft & { id: string; category: QuestionCategory };
export type QuestionMetadata = { internalKey: string; id?: string; internalId?: string; order?: number; origin: "generated"; edited: boolean; pinned: boolean };
export type QuestionGenerationWarning = { code: string; message: string; category?: QuestionCategory; recoverable: boolean };
export type QuestionGenerationResult = { questions: GeneratedQuestion[]; metadata: QuestionMetadata[]; warnings: QuestionGenerationWarning[] };
