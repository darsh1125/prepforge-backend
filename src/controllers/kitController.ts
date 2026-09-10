import mongoose from "mongoose";
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

function currentUserId(req: Request): string {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true });
  return req.auth.userId;
}

function validKitId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true });
  return value;
}

function serialize(record: KitDocument) {
  return { id: record._id.toString(), input: record.input, status: record.status, progress: record.progress, warnings: record.warnings, kit: record.kit ?? null, extraction: record.extraction ?? null, questions: record.questions ?? [], coverage: record.coverage ?? null, research: record.research ?? null, createdAt: record.createdAt, updatedAt: record.updatedAt };
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
