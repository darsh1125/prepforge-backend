import mongoose, { type HydratedDocument } from "mongoose";
import type { Request, Response } from "express";
import { AppError } from "../core/errors/appError.js";
import { createInputFingerprint } from "../core/fingerprint.js";
import { Kit, type KitDocument } from "../models/Kit.js";
import { kitInputSchema, kitUpdateSchema } from "../schemas/kitInput.js";
import { crawlCompanySite } from "../core/retrieval/crawl-company.js";
import { researchInterview } from "../core/research/interview-search.js";
import { extractJobDescription } from "../core/extraction/jd-extractor.js";
import { generateQuestionsWithCoverage } from "../core/coverage/index.js";
import { roleSchema } from "../schemas/kit.js";
import { createLLMClient } from "../core/llm/client.js";
import { generateFlashcards } from "../core/generation/flashcards/index.js";
import { buildStudySchedule } from "../core/scheduling/index.js";
import { questionSchema } from "../schemas/kit.js";
import { generateKitPipeline, defaultPipelineDependencies } from "../core/pipeline/generateKit.js";
import type { PipelineProgress } from "../core/pipeline/types.js";
import { loadEnv } from "../config/env.js";
import { ACTIVE_GENERATION_STATUSES, isActiveGeneration } from "../core/pipeline/lock.js";

function currentUserId(req: Request): string {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true });
  return req.auth.userId;
}

function validKitId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  return value;
}

function serialize(record: KitDocument) {
  const editorMetadata = (record.editorMetadata as Record<string, unknown> | null) ?? {};
  return { id: record._id.toString(), input: record.input, status: record.status, progress: record.progress, generation: record.generation ?? null, revision: record.revision ?? 0, derivedState: record.derivedState ?? null, questionMetadata: record.questionMetadata ?? [], flashcardMetadata: record.flashcardMetadata ?? [], companyBriefMeta: editorMetadata.companyBriefMeta ?? null, warnings: record.warnings, kit: record.kit ?? null, extraction: record.extraction ?? null, questions: record.questions ?? [], coverage: record.coverage ?? null, flashcards: record.flashcards ?? [], schedule: record.schedule ?? null, research: record.research ?? null, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

export async function createKit(req: Request, res: Response): Promise<void> {
  const input = kitInputSchema.parse(req.body);
  const record = await Kit.create({ ownerId: currentUserId(req), input, status: "queued", progress: { stage: "queued", percent: 0, message: "Ready for generation" }, warnings: [], kit: null, inputFingerprint: createInputFingerprint(input.jd, input.company_url) });
  res.status(201).json({ kit: serialize(record) });
}

export async function listKits(req: Request, res: Response): Promise<void> {
  const records = await Kit.find({ ownerId: currentUserId(req) }).sort({ updatedAt: -1 });
  res.json({ kits: records.map(serialize) });
}

export async function getKit(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  res.json({ kit: serialize(record) });
}

export async function updateKit(req: Request, res: Response): Promise<void> {
  const input = kitUpdateSchema.parse(req.body);
  if (Object.keys(input).length === 0) throw new AppError("VALIDATION_ERROR", "At least one input field is required", 400, { expose: true });
  const current = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!current) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  if (current.status !== "queued") throw new AppError("CONFLICT", "This kit can no longer be edited", 409, { expose: true });
  const nextInput = kitInputSchema.parse({ ...current.input, ...input });
  current.input = nextInput;
  current.inputFingerprint = createInputFingerprint(nextInput.jd, nextInput.company_url);
  await current.save();
  res.json({ kit: serialize(current) });
}

export async function deleteKit(req: Request, res: Response): Promise<void> {
  const deleted = await Kit.findOneAndDelete({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!deleted) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  res.json({ success: true });
}

export async function researchCompany(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const companyUrl = record.input?.company_url;
  if (!companyUrl) throw new AppError("CONFLICT", "Kit does not have a company URL", 409, { expose: true });
  const result = await crawlCompanySite({ companyUrl, mode: "production" });
  record.set("warnings", result.warnings.map((warning) => ({ code: warning.code, message: warning.message, stage: warning.stage, recoverable: warning.recoverable })));
  await record.save();
  res.json({ research: result });
}

export async function researchInterviewProcess(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const companyUrl = record.input?.company_url;
  if (!companyUrl) throw new AppError("CONFLICT", "Kit does not have a company URL", 409, { expose: true });
  record.status = "researching_interview";
  await record.save();
  const result = await researchInterview({ companyUrl, mode: "production" });
  record.set("research", { ...(record.research ?? {}), interview: result });
  record.set("warnings", result.warnings.map((warning) => ({ code: warning.code, message: warning.message, stage: warning.stage, recoverable: warning.recoverable })));
  await record.save();
  res.json({ research: result });
}

export async function extractKitRequirements(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const jd = record.input?.jd;
  if (!jd) throw new AppError("CONFLICT", "Kit does not have a job description", 409, { expose: true });
  record.status = "extracting_requirements";
  await record.save();
  const extraction = await extractJobDescription(jd);
  record.set("extraction", extraction);
  record.set("warnings", extraction.warnings.map((warning) => ({ code: warning.code, message: warning.message, stage: "extract_requirements", recoverable: warning.recoverable })));
  await record.save();
  res.json({ extraction });
}

export async function generateKitQuestions(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const extraction = record.extraction as { role?: unknown } | null;
  if (!extraction?.role) throw new AppError("ROLE_EXTRACTION_REQUIRED", "Analyze the job description before generating questions", 409, { expose: true });
  const role = roleSchema.parse(extraction.role);
  record.status = "generating_questions";
  record.progress = { stage: "generating_questions", percent: 0, message: "Generating interview questions" };
  await record.save();
  const research = record.research as { interview?: unknown; company?: unknown } | null;
  record.progress = { stage: "checking_coverage", percent: 35, message: "Checking requirement coverage" };
  await record.save();
  const result = await generateQuestionsWithCoverage({ role, requirements: role.requirements, interviewResearch: research?.interview as never, companyResearch: research?.company as never }, createLLMClient());
  record.set("questions", result.questions);
  record.set("questionMetadata", result.metadata);
  record.set("coverage", result.coverage);
  record.set("warnings", result.warnings.map((warning) => ({ code: warning.code, message: warning.message, stage: "generate_questions", recoverable: warning.recoverable })));
  record.status = result.status === "FAILURE" ? "failed" : result.status === "PARTIAL_SUCCESS" ? "completed_with_warnings" : "completed";
  record.progress = { stage: record.status, percent: 100, message: result.status === "FULL_SUCCESS" ? "Requirement coverage complete" : result.status === "PARTIAL_SUCCESS" ? "Question generation completed with nice-to-have gaps" : "Question generation failed requirement coverage" };
  await record.save();
  res.json({ questions: result.questions, metadata: result.metadata, warnings: result.warnings, coverage: result.coverage, coverage_status: result.status, status: record.status });
}

export async function generateKitFlashcards(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const extraction = record.extraction as { role?: unknown } | null;
  if (!extraction?.role) throw new AppError("ROLE_EXTRACTION_REQUIRED", "Analyze the job description before generating flashcards", 409, { expose: true });
  const role = roleSchema.parse(extraction.role);
  const questions = questionSchema.array().parse(record.questions ?? []);
  record.status = "generating_flashcards";
  record.progress = { stage: "generating_flashcards", percent: 0, message: "Generating interview flashcards" };
  await record.save();
  const result = await generateFlashcards({ role, requirements: role.requirements, questions }, createLLMClient());
  const warnings = result.warnings.map((warning) => ({ code: warning.code, message: warning.message, stage: "generate_flashcards", recoverable: warning.recoverable }));
  if (result.ok) {
    record.set("flashcards", result.flashcards);
    record.set("flashcardMetadata", result.metadata);
  }
  record.set("warnings", [...(record.warnings ?? []), ...warnings]);
  record.progress = { stage: "generating_flashcards", percent: 100, message: result.ok ? "Flashcards ready" : "Flashcard generation failed; existing kit content preserved" };
  await record.save();
  res.json({ flashcards: result.ok ? result.flashcards : record.flashcards ?? [], metadata: result.ok ? result.metadata : record.flashcardMetadata ?? [], warnings: result.warnings, status: record.status });
}

export async function generateKitSchedule(req: Request, res: Response): Promise<void> {
  const record = await Kit.findOne({ _id: validKitId(req.params.id), ownerId: currentUserId(req) });
  if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const extraction = record.extraction as { role?: unknown } | null;
  if (!extraction?.role) throw new AppError("ROLE_EXTRACTION_REQUIRED", "Analyze the job description before building a schedule", 409, { expose: true });
  const role = roleSchema.parse(extraction.role);
  const questions = questionSchema.array().parse(record.questions ?? []);
  record.status = "building_schedule";
  record.progress = { stage: "building_schedule", percent: 0, message: "Building deterministic study schedule" };
  await record.save();
  try {
    const result = buildStudySchedule({ daysAvailable: record.input?.days ?? 1, role, requirements: role.requirements, questions });
    record.set("schedule", result.schedule);
    record.progress = { stage: "building_schedule", percent: 100, message: "Study schedule ready" };
    await record.save();
    res.json({ schedule: result.schedule, status: record.status });
  } catch (error) {
    record.status = "failed";
    record.progress = { stage: "failed", percent: 100, message: "Could not build a valid study schedule" };
    await record.save();
    throw new AppError("SCHEDULE_GENERATION_FAILED", error instanceof Error ? error.message : "Could not build a valid study schedule", 422, { expose: true, cause: error });
  }
}

type KitRecordDocument = HydratedDocument<KitDocument>;

async function persistPipelineProgress(record: KitRecordDocument, progress: PipelineProgress): Promise<void> {
  const now = new Date().toISOString();
  record.status = progress.stage;
  record.progress = { stage: progress.stage, percent: progress.percent ?? 0, message: progress.message };
  record.set("generation", { ...(record.generation as Record<string, unknown> | null ?? {}), status: progress.stage, stage: progress.stage, message: progress.message, percent: progress.percent ?? 0, updatedAt: now });
  await record.save();
}

async function runCanonicalPipeline(record: KitRecordDocument): Promise<void> {
  try {
    const result = await generateKitPipeline({ kitId: record._id.toString(), jd: record.input?.jd ?? "", companyUrl: record.input?.company_url ?? "", daysAvailable: record.input?.days ?? 1, mode: "production" }, defaultPipelineDependencies(), (progress) => persistPipelineProgress(record, progress));
    const now = new Date().toISOString();
    if (result.kit && result.state) {
      record.set("kit", result.kit);
      record.set("research", { company: result.state.crawl, interview: result.state.interview });
      record.set("extraction", result.state.extraction);
      record.set("questions", result.state.questions.questions);
      record.set("questionMetadata", result.state.questions.metadata);
      record.set("coverage", result.state.questions.coverage);
      record.set("flashcards", result.state.flashcards.flashcards);
      record.set("flashcardMetadata", result.state.flashcards.metadata);
      record.set("schedule", result.state.schedule.schedule);
    }
    record.status = result.status;
    record.progress = { stage: result.status, percent: 100, message: result.status === "completed" ? "Prep kit completed" : result.status === "completed_with_warnings" ? "Prep kit completed with warnings" : result.error?.message ?? "Prep kit generation failed" };
    record.set("warnings", result.warnings.map((item) => ({ code: item.code, message: item.message, stage: item.stage, recoverable: item.recoverable })));
    record.set("generation", { ...(record.generation as Record<string, unknown> | null ?? {}), status: result.status, stage: result.status, updatedAt: now, completedAt: now, error: result.error ?? null, warningCodes: result.warnings.map((item) => item.code) });
    await record.save();
  } catch (error) {
    const now = new Date().toISOString();
    record.status = "failed";
    record.progress = { stage: "failed", percent: 100, message: "Prep kit generation failed" };
    record.set("warnings", [{ code: "PIPELINE_FAILED", message: error instanceof Error ? error.message : "Prep kit generation failed", stage: "pipeline", recoverable: false }]);
    record.set("generation", { ...(record.generation as Record<string, unknown> | null ?? {}), status: "failed", stage: "failed", updatedAt: now, completedAt: now, error: { code: "PIPELINE_FAILED", message: "Prep kit generation failed" } });
    await record.save();
  }
}

export async function generateKitPipelineRequest(req: Request, res: Response): Promise<void> {
  const ownerId = currentUserId(req);
  const id = validKitId(req.params.id);
  const current = await Kit.findOne({ _id: id, ownerId });
  if (!current) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  const env = loadEnv();
  const generation = current.generation as { updatedAt?: string; attempt?: number } | null;
  const staleAt = new Date(Date.now() - env.GENERATION_STALE_MINUTES * 60_000).toISOString();
  if (isActiveGeneration(current.status) && generation?.updatedAt && generation.updatedAt >= staleAt) throw new AppError("GENERATION_ALREADY_IN_PROGRESS", "Generation is already in progress", 409, { details: { status: current.status, progress: current.progress }, expose: true });
  const now = new Date().toISOString();
  const locked = await Kit.findOneAndUpdate(
    { _id: id, ownerId, $or: [{ status: { $nin: ACTIVE_GENERATION_STATUSES } }, { status: { $in: ACTIVE_GENERATION_STATUSES }, $or: [{ "generation.updatedAt": { $lt: staleAt } }, { "generation.updatedAt": { $exists: false } }] }] },
    { $set: { status: "queued", progress: { stage: "queued", percent: 0, message: "Generation queued" }, generation: { status: "queued", stage: "queued", percent: 0, message: "Generation queued", attempt: (generation?.attempt ?? 0) + 1, startedAt: now, updatedAt: now, warnings: [] } } },
    { new: true },
  );
  if (!locked) throw new AppError("GENERATION_ALREADY_IN_PROGRESS", "Generation is already in progress", 409, { expose: true });
  void runCanonicalPipeline(locked);
  res.status(202).json({ kit: serialize(locked) });
}
