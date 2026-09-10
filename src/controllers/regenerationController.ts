import mongoose, { type HydratedDocument } from "mongoose";
import type { Request, Response } from "express";
import { Kit, type KitDocument } from "../models/Kit.js";
import { AppError } from "../core/errors/appError.js";
import { createLLMClient } from "../core/llm/client.js";
import { regenerateCompanyBrief, regenerateQuestionCategory, regenerateSchedule } from "../core/regeneration/index.js";
import { regenerationCategorySchema, regenerationRequestSchema } from "../schemas/builder.js";
import { questionSchema } from "../schemas/kit.js";
import { assertRevision, derive, editor, response, roleOf, save } from "./builderController.js";

type KitRecordDocument = HydratedDocument<KitDocument>;
function userId(req: Request): string { if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true }); return req.auth.userId; }
function id(req: Request): string { if (typeof req.params.id !== "string" || !mongoose.isValidObjectId(req.params.id)) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true }); return req.params.id; }
async function owned(req: Request): Promise<KitRecordDocument> { const record = await Kit.findOne({ _id: id(req), ownerId: userId(req) }); if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true }); return record; }
function research(record: KitRecordDocument) { const data = (record.research as { company?: unknown; interview?: unknown } | null) ?? {}; return { company: data.company as never, interview: data.interview as never }; }

export async function regenerateCompanyBriefEndpoint(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const body = regenerationRequestSchema.parse(req.body); assertRevision(record, body.expectedRevision);
  const currentKit = (record.kit as Record<string, unknown> | null) ?? {}; const current = currentKit.company_brief as { summary: string; what_they_do: string; sources: string[] } | undefined;
  if (!current) throw new AppError("REGENERATION_FAILED", "Company brief is not available yet", 409, { expose: true });
  const meta = (editor(record).companyBriefMeta as { summaryEdited?: boolean; whatTheyDoEdited?: boolean } | undefined) ?? {};
  const result = regenerateCompanyBrief({ current, metadata: meta, companyResearch: research(record).company, interviewResearch: research(record).interview });
  record.set("kit", { ...currentKit, company_brief: result }); await save(record); res.json(response(record));
}

export async function regenerateQuestionCategoryEndpoint(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const category = regenerationCategorySchema.parse(req.params.category); const body = regenerationRequestSchema.parse(req.body); assertRevision(record, body.expectedRevision);
  const role = roleOf(record); const questions = questionSchema.array().parse(record.questions ?? []); const metadata = (record.questionMetadata ?? []) as never; const data = editor(record);
  const sources = research(record); const result = await regenerateQuestionCategory({ category, role, requirements: role.requirements, questions, metadata, deletedQuestionIds: (data.deletedQuestionIds as string[] | undefined) ?? [], companyResearch: sources.company, interviewResearch: sources.interview }, createLLMClient());
  record.set("questions", result.questions); record.set("questionMetadata", result.metadata); derive(record, role, result.questions); record.set("editorMetadata", { ...data, deletedQuestionIds: [...((data.deletedQuestionIds as string[] | undefined) ?? []), ...questions.filter((question) => !result.questions.some((next) => next.id === question.id)).map((question) => question.id)] });
  await save(record); res.json({ ...response(record), warnings: result.warnings, preservedCount: result.preserved.length, replacedCount: result.replacedCount });
}

export async function regenerateScheduleEndpoint(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const body = regenerationRequestSchema.parse(req.body); assertRevision(record, body.expectedRevision); const role = roleOf(record); const questions = questionSchema.array().parse(record.questions ?? []);
  let schedule; try { schedule = regenerateSchedule({ daysAvailable: record.input?.days ?? 1, role, questions }); } catch (error) { throw new AppError("REGENERATION_FAILED", error instanceof Error ? error.message : "Could not rebuild schedule", 422, { expose: true }); }
  record.set("schedule", schedule); const currentKit = (record.kit as Record<string, unknown> | null) ?? {}; record.set("kit", { ...currentKit, schedule }); await save(record); res.json(response(record));
}
