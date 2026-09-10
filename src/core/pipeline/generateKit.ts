import { inputDaysSchema } from "../../schemas/kit.js";
import { AppError, type PipelineIssue } from "../errors/appError.js";
import { inspectUrlPolicy } from "../retrieval/urlPolicy.js";
import { crawlCompanySite } from "../retrieval/crawl-company.js";
import { researchInterview } from "../research/interview-search.js";
import { extractJobDescription } from "../extraction/jd-extractor.js";
import { generateQuestionsWithCoverage } from "../coverage/generate-with-coverage.js";
import { generateFlashcards } from "../generation/flashcards/generate-flashcards.js";
import { buildStudySchedule } from "../scheduling/build-schedule.js";
import { createLLMClient, type LLMClient } from "../llm/client.js";
import { assertValidFinalInterviewKit } from "../validation/kit.js";
import { buildExternalKit } from "./external-kit.js";
import type { PipelineDependencies, PipelineInput, PipelineProgress, PipelineResult, PipelineStage, PipelineWarning } from "./types.js";

const percent: Partial<Record<PipelineStage, number>> = { queued: 0, crawling_company: 10, researching_interview: 20, extracting_requirements: 30, generating_questions: 45, checking_coverage: 55, filling_gaps: 62, generating_flashcards: 75, building_schedule: 85, validating: 95, completed: 100, completed_with_warnings: 100, failed: 100 };

export function defaultPipelineDependencies(llm: LLMClient = createLLMClient()): PipelineDependencies {
  return { crawlCompany: async ({ companyUrl, mode }) => crawlCompanySite({ companyUrl, mode: mode === "evaluation" ? "evaluator" : "production" }), researchInterview, extractJobDescription, generateQuestions: generateQuestionsWithCoverage, generateFlashcards, buildSchedule: buildStudySchedule, llm, now: () => new Date().toISOString() };
}

function warning(issue: PipelineIssue | { code: string; message: string; recoverable: boolean; url?: string }, stage: PipelineStage): PipelineWarning { return { code: issue.code, message: issue.message, recoverable: issue.recoverable ?? true, url: "url" in issue ? issue.url : undefined, stage }; }

export async function generateKitPipeline(input: PipelineInput, dependencies: PipelineDependencies = defaultPipelineDependencies(), onProgress: (progress: PipelineProgress) => void | Promise<void> = () => undefined): Promise<PipelineResult> {
  const parsedDays = inputDaysSchema.safeParse(input.daysAvailable);
  if (!parsedDays.success) return { status: "failed", warnings: [], error: { code: "VALIDATION_ERROR", message: "days must be an integer between 1 and 60", stage: "queued", retryable: false } };
  const urlIssues = inspectUrlPolicy(input.companyUrl, input.mode === "evaluation" ? "evaluator" : "production");
  if (urlIssues.length > 0) return { status: "failed", warnings: [], error: { code: "VALIDATION_ERROR", message: "company_url failed retrieval policy checks", stage: "queued", retryable: false } };
  const warnings: PipelineWarning[] = [];
  let currentStage: PipelineStage = "queued";
  const report = async (stage: PipelineStage, message: string, metadata?: Record<string, unknown>) => onProgress({ stage, message, percent: percent[stage], metadata });
  try {
    await report("crawling_company", "Researching the company website");
    currentStage = "crawling_company";
    const crawl = await dependencies.crawlCompany({ companyUrl: input.companyUrl, mode: input.mode });
    warnings.push(...crawl.warnings.map((issue) => warning(issue, "crawling_company")));
    await report("researching_interview", "Researching public interview evidence");
    currentStage = "researching_interview";
    const interview = await dependencies.researchInterview({ companyName: crawl.metadata.companyNameHint, companyUrl: input.companyUrl, mode: input.mode === "evaluation" ? "evaluator" : "production", roleTitle: undefined });
    warnings.push(...interview.warnings.map((issue) => warning(issue, "researching_interview")));
    await report("extracting_requirements", "Extracting role requirements from the job description");
    currentStage = "extracting_requirements";
    const extraction = await dependencies.extractJobDescription(input.jd, dependencies.llm);
    warnings.push(...extraction.warnings.map((issue) => warning(issue, "extracting_requirements")));
    await report("generating_questions", "Generating interview questions");
    currentStage = "generating_questions";
    const questions = await dependencies.generateQuestions({ role: extraction.role, requirements: extraction.role.requirements, interviewResearch: interview }, dependencies.llm);
    warnings.push(...questions.warnings.map((issue) => warning(issue, "generating_questions")));
    await report("checking_coverage", "Checking deterministic requirement coverage");
    currentStage = "checking_coverage";
    if (questions.coverage.passes > 1) await report("filling_gaps", "Filling uncovered requirement gaps", { passes: questions.coverage.passes });
    if (questions.status === "FAILURE" || questions.diagnostics.uncoveredMustRequirementIds.length > 0) { await report("failed", "One or more must-have requirements remain uncovered"); return { status: "failed", warnings, error: { code: "MUST_REQUIREMENT_COVERAGE_FAILED", message: "One or more must-have requirements remain uncovered", stage: "checking_coverage", retryable: false } }; }
    await report("generating_flashcards", "Generating interview flashcards");
    currentStage = "generating_flashcards";
    const flashcards = await dependencies.generateFlashcards({ role: extraction.role, requirements: extraction.role.requirements, questions: questions.questions }, dependencies.llm);
    warnings.push(...flashcards.warnings.map((issue) => warning(issue, "generating_flashcards")));
    await report("building_schedule", "Building deterministic study schedule");
    currentStage = "building_schedule";
    const schedule = await dependencies.buildSchedule({ daysAvailable: parsedDays.data, role: extraction.role, requirements: extraction.role.requirements, questions: questions.questions, coverageMap: questions.diagnostics.coverageMap });
    await report("validating", "Validating the final interview kit");
    currentStage = "validating";
    const kit = assertValidFinalInterviewKit(buildExternalKit({ companyUrl: input.companyUrl, jd: input.jd, researchedAt: dependencies.now(), crawl, interview, extraction, questions, flashcards, schedule }));
    const status = warnings.length > 0 ? "completed_with_warnings" : "completed";
    await report(status, status === "completed" ? "Prep kit completed" : "Prep kit completed with warnings");
    return { status, kit, warnings, state: { crawl, interview, extraction, role: extraction.role, questions, flashcards, schedule } };
  } catch (error) {
    const appError = error instanceof AppError ? error : undefined;
    const stage: PipelineStage = currentStage;
    const pipelineError = { code: appError?.code ?? "PIPELINE_FAILED", message: appError?.message ?? "Prep kit generation failed", stage, retryable: appError?.statusCode === 503 };
    await report("failed", pipelineError.message);
    return { status: "failed", warnings, error: pipelineError };
  }
}

export { AppError };
export type * from "./types.js";
