import type { InterviewKit, Role } from "../../schemas/kit.js";
import type { FlashcardGenerationResult } from "../generation/flashcards/types.js";
import type { QuestionsWithCoverageResult } from "../coverage/generate-with-coverage.js";
import type { ScheduleResult } from "../scheduling/types.js";
import type { CompanyCrawlResult } from "../retrieval/types.js";
import type { InterviewResearchResult } from "../research/types.js";
import type { JDExtractionResult } from "../extraction/types.js";
import type { LLMClient } from "../llm/client.js";

export type PipelineStage = "queued" | "crawling_company" | "researching_interview" | "extracting_requirements" | "generating_questions" | "checking_coverage" | "filling_gaps" | "generating_flashcards" | "building_schedule" | "validating" | "completed" | "completed_with_warnings" | "failed";
export type PipelineWarning = { code: string; message: string; stage: PipelineStage; recoverable: boolean; url?: string };
export type PipelineError = { code: string; message: string; stage: PipelineStage; retryable: boolean };
export type PipelineProgress = { stage: PipelineStage; message: string; percent?: number; metadata?: Record<string, unknown> };
export type PipelineInput = { kitId?: string; jd: string; companyUrl: string; daysAvailable: number; mode: "production" | "evaluation" };
export type PipelineState = { crawl: CompanyCrawlResult; interview: InterviewResearchResult; extraction: JDExtractionResult; role: Role; questions: QuestionsWithCoverageResult; flashcards: FlashcardGenerationResult; schedule: ScheduleResult };
export type PipelineDependencies = { crawlCompany: (input: { companyUrl: string; mode: "production" | "evaluation" }) => Promise<CompanyCrawlResult>; researchInterview: typeof import("../research/interview-search.js").researchInterview; extractJobDescription: typeof import("../extraction/jd-extractor.js").extractJobDescription; generateQuestions: typeof import("../coverage/generate-with-coverage.js").generateQuestionsWithCoverage; generateFlashcards: typeof import("../generation/flashcards/generate-flashcards.js").generateFlashcards; buildSchedule: typeof import("../scheduling/build-schedule.js").buildStudySchedule; llm: LLMClient; now: () => string };
export type PipelineResult = { status: "completed" | "completed_with_warnings" | "failed"; kit?: InterviewKit; warnings: PipelineWarning[]; error?: PipelineError; state?: PipelineState };
