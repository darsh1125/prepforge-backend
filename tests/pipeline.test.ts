import { describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors/appError.js";
import { generateKitPipeline } from "../src/core/pipeline/generateKit.js";
import type { PipelineDependencies, PipelineInput } from "../src/core/pipeline/types.js";
import type { QuestionsWithCoverageResult } from "../src/core/coverage/generate-with-coverage.js";
import type { FlashcardGenerationResult } from "../src/core/generation/flashcards/types.js";
import type { ScheduleResult } from "../src/core/scheduling/types.js";
import type { CompanyCrawlResult } from "../src/core/retrieval/types.js";
import type { InterviewResearchResult } from "../src/core/research/types.js";
import type { JDExtractionResult } from "../src/core/extraction/types.js";
import type { LLMClient } from "../src/core/llm/client.js";

const input: PipelineInput = { jd: "Frontend Engineer\nReact experience required.", companyUrl: "https://example.com", daysAvailable: 5, mode: "production" };
const extraction: JDExtractionResult = { role: { title: "Frontend Engineer", seniority: "mid", location: "Remote", responsibilities: ["Build interfaces"], requirements: [{ id: "r1", text: "React", kind: "technical", priority: "must" }] }, warnings: [], metadata: { provider: "fake", model: "test", attempts: 1, extractedAt: "2026-09-10T00:00:00.000Z", jdChars: input.jd.length } };
const crawl: CompanyCrawlResult = { requestedUrl: input.companyUrl, pages: [{ url: input.companyUrl, statusCode: 200, contentType: "text/html", title: "Acme", text: "Acme builds developer tools.", links: [], fetchedAt: "2026-09-10T00:00:00.000Z" }], pagesUsed: [input.companyUrl], warnings: [], metadata: { companyNameHint: "Acme" } };
const interview: InterviewResearchResult = { companyIdentifier: "Acme", queries: ["Acme interview process"], sources: [], warnings: [], metadata: { startedAt: "2026-09-10T00:00:00.000Z", completedAt: "2026-09-10T00:00:01.000Z", sourceCount: 0, successfulFetches: 0, failedFetches: 0 } };
const questions: QuestionsWithCoverageResult = { questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain React rendering.", answer_outline: "Discuss state and props.", difficulty: 2 }], metadata: [{ internalKey: "technical-q1", origin: "generated", edited: false, pinned: false }], warnings: [], coverage: { uncovered_requirement_ids: [], passes: 1 }, diagnostics: { coveredRequirementIds: ["r1"], uncoveredRequirementIds: [], uncoveredMustRequirementIds: [], uncoveredNiceRequirementIds: [], coverageMap: { r1: ["q1"] }, coverageRatio: 1 }, status: "FULL_SUCCESS" };
const flashcards: FlashcardGenerationResult = { flashcards: [{ id: "f1", front: "What drives React rendering?", back: "State and props.", requirement_ids: ["r1"] }], metadata: [{ internalKey: "flashcard-f1", origin: "generated", edited: false, pinned: false }], warnings: [], ok: true };
const schedule: ScheduleResult = { schedule: { days_available: 5, days: Array.from({ length: 5 }, (_, index) => ({ day: index + 1, focus: "Technical requirements practice", question_ids: ["q1"], minutes: 60 })) }, diagnostics: { questionScores: { q1: 14 }, totalMinutes: 300 } };
const noopLlm: LLMClient = { generateStructured: async <T>() => ({}) as T };

function deps(overrides: Partial<PipelineDependencies> = {}): PipelineDependencies {
  return { crawlCompany: async () => crawl, researchInterview: async () => interview, extractJobDescription: async () => extraction, generateQuestions: async () => questions, generateFlashcards: async () => flashcards, buildSchedule: () => schedule, llm: noopLlm, now: () => "2026-09-10T00:00:02.000Z", ...overrides };
}

describe("canonical generation pipeline", () => {
  it("runs the happy path and reports ordered progress", async () => {
    const stages: string[] = [];
    const result = await generateKitPipeline(input, deps(), (progress) => { stages.push(progress.stage); });
    expect(result.status).toBe("completed");
    expect(result.kit?.schedule.days).toHaveLength(5);
    expect(stages).toEqual(["crawling_company", "researching_interview", "extracting_requirements", "generating_questions", "checking_coverage", "generating_flashcards", "building_schedule", "validating", "completed"]);
  });

  it("continues with warnings when company or interview research is unavailable", async () => {
    const result = await generateKitPipeline(input, deps({ crawlCompany: async () => ({ ...crawl, pages: [], pagesUsed: [], metadata: {}, warnings: [{ code: "COMPANY_UNREACHABLE", message: "Unavailable", stage: "crawl", recoverable: false }] }), researchInterview: async () => ({ ...interview, warnings: [{ code: "NO_PUBLIC_INTERVIEW_SOURCES", message: "No sources", stage: "research", recoverable: true }] }) }));
    expect(result.status).toBe("completed_with_warnings");
    expect(result.warnings.map((warning) => warning.code)).toEqual(["COMPANY_UNREACHABLE", "NO_PUBLIC_INTERVIEW_SOURCES"]);
    expect(result.kit?.company_brief.sources).toEqual([]);
  });

  it("fails at extraction without inventing requirements", async () => {
    const result = await generateKitPipeline(input, deps({ extractJobDescription: async () => { throw new AppError("JD_EXTRACTION_FAILED", "Extraction failed", 502, { expose: true }); } }));
    expect(result.status).toBe("failed");
    expect(result.error?.stage).toBe("extracting_requirements");
    expect(result.kit).toBeUndefined();
  });

  it("keeps partial question warnings and treats flashcard failure as recoverable", async () => {
    const result = await generateKitPipeline(input, deps({ generateQuestions: async () => ({ ...questions, warnings: [{ code: "QUESTION_CATEGORY_GENERATION_FAILED", message: "Behavioural failed", recoverable: true }] }), generateFlashcards: async () => ({ flashcards: [], metadata: [], warnings: [{ code: "FLASHCARD_GENERATION_FAILED", message: "Provider failed", recoverable: true }], ok: false }) }));
    expect(result.status).toBe("completed_with_warnings");
    expect(result.kit?.flashcards).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["QUESTION_CATEGORY_GENERATION_FAILED", "FLASHCARD_GENERATION_FAILED"]);
  });

  it("fails when must coverage or scheduling cannot be satisfied", async () => {
    const failedCoverage = { ...questions, status: "FAILURE" as const, diagnostics: { ...questions.diagnostics, uncoveredMustRequirementIds: ["r1"], uncoveredRequirementIds: ["r1"] }, coverage: { uncovered_requirement_ids: ["r1"], passes: 2 } };
    const coverageResult = await generateKitPipeline(input, deps({ generateQuestions: async () => failedCoverage }));
    expect(coverageResult.status).toBe("failed");
    const scheduleResult = await generateKitPipeline(input, deps({ buildSchedule: () => { throw new Error("SCHEDULE_MUST_REQUIREMENT_UNCOVERED:r1"); } }));
    expect(scheduleResult.status).toBe("failed");
    expect(scheduleResult.error?.stage).toBe("building_schedule");
  });

  it("fails final validation instead of persisting an invalid schedule", async () => {
    const invalidSchedule = { ...schedule, schedule: { ...schedule.schedule, days: schedule.schedule.days.map((day, index) => index === 0 ? { ...day, question_ids: ["q999"] } : day) } };
    const result = await generateKitPipeline(input, deps({ buildSchedule: () => invalidSchedule }));
    expect(result.status).toBe("failed");
    expect(result.error?.stage).toBe("validating");
  });

  it("rejects invalid days before starting external stages", async () => {
    const result = await generateKitPipeline({ ...input, daysAvailable: 61 }, deps());
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });
});
