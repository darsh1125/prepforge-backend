import type { QuestionCategory, Question, Requirement, Role, InterviewKit } from "../../schemas/kit.js";
import type { CompanyCrawlResult } from "../retrieval/types.js";
import type { InterviewResearchResult } from "../research/types.js";
import type { LLMClient } from "../llm/client.js";
import type { EditorItemMetadata } from "../builder/types.js";

export type RegenerationContext = { role: Role; requirements: Requirement[]; companyResearch?: CompanyCrawlResult; interviewResearch?: InterviewResearchResult; client?: LLMClient };
export type QuestionRegenerationInput = RegenerationContext & { category: QuestionCategory; questions: Question[]; metadata: EditorItemMetadata[]; deletedQuestionIds?: string[] };
export type QuestionRegenerationResult = { questions: Question[]; metadata: EditorItemMetadata[]; preserved: Question[]; replacedCount: number; warnings: { code: string; message: string }[] };
export type CompanyBriefRegenerationInput = { current: InterviewKit["company_brief"]; metadata: { summaryEdited?: boolean; whatTheyDoEdited?: boolean }; companyResearch?: CompanyCrawlResult; interviewResearch?: InterviewResearchResult };
