import mongoose, { type HydratedDocument } from "mongoose";
import type { Request, Response } from "express";
import { AppError } from "../core/errors/appError.js";
import { checkCoverage } from "../core/coverage/check-coverage.js";
import { buildStudySchedule } from "../core/scheduling/build-schedule.js";
import { createMetadata, hasQuestionContentChanged, nextExportId, normalizeMetadata } from "../core/builder/state.js";
import { Kit, type KitDocument } from "../models/Kit.js";
import { companyBriefUpdateSchema, expectedRevisionSchema, flashcardCreateSchema, flashcardUpdateSchema, pinSchema, questionCreateSchema, questionUpdateSchema, reorderSchema } from "../schemas/builder.js";
import { flashcardSchema, questionSchema, roleSchema, type Flashcard, type Question, type Role } from "../schemas/kit.js";

type KitRecordDocument = HydratedDocument<KitDocument>;

function userId(req: Request): string { if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true }); return req.auth.userId; }
function kitId(value: string | string[] | undefined): string { if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true }); return value; }
function paramId(req: Request, name: string): string { const value = req.params[name]; if (typeof value !== "string" || value.length === 0) throw new AppError("NOT_FOUND", "Item not found", 404, { expose: true }); return value; }
async function owned(req: Request): Promise<KitRecordDocument> { const record = await Kit.findOne({ _id: kitId(req.params.id), ownerId: userId(req) }); if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true }); return record; }
export function roleOf(record: KitRecordDocument): Role { const source = (record.kit as { role?: unknown } | null)?.role ?? (record.extraction as { role?: unknown } | null)?.role; if (!source) throw new AppError("ROLE_EXTRACTION_REQUIRED", "Analyze the job description before editing the kit", 409, { expose: true }); return roleSchema.parse(source); }
export function editor(record: KitRecordDocument): Record<string, unknown> { return (record.editorMetadata as Record<string, unknown> | null) ?? {}; }
export function assertRevision(record: KitRecordDocument, expected: number): void { if ((record.revision ?? 0) !== expected) throw new AppError("KIT_VERSION_CONFLICT", "This kit changed in another tab. Reload the latest version before saving.", 409, { details: { currentRevision: record.revision ?? 0 }, expose: true }); }
export function response(record: KitRecordDocument) { return { revision: record.revision ?? 0, questions: record.questions ?? [], questionMetadata: record.questionMetadata ?? [], flashcards: record.flashcards ?? [], flashcardMetadata: record.flashcardMetadata ?? [], coverage: record.coverage ?? null, schedule: record.schedule ?? null, derivedState: record.derivedState ?? null, companyBriefMeta: (editor(record).companyBriefMeta as unknown) ?? null, kit: record.kit ?? null }; }

function validReferences(ids: string[], role: Role): void { const valid = new Set(role.requirements.map((requirement) => requirement.id)); const invalid = ids.filter((id) => !valid.has(id)); if (invalid.length) throw new AppError("VALIDATION_ERROR", `Unknown requirement reference: ${invalid.join(", ")}`, 400, { expose: true }); }

function updateExternal(record: KitRecordDocument, role: Role, questions: Question[], flashcards: Flashcard[], coverage: unknown, schedule: unknown): void {
  const current = (record.kit as Record<string, unknown> | null) ?? {};
  record.set("kit", { ...current, role, questions, flashcards, coverage, schedule });
}

export function derive(record: KitRecordDocument, role: Role, questions: Question[], removedQuestionId?: string): void {
  const coverage = checkCoverage(role.requirements, questions);
  let schedule = record.schedule as { days_available: number; days: { day: number; focus: string; question_ids: string[]; minutes: number }[] } | null;
  let scheduleStale = false;
  if (schedule) {
    if (removedQuestionId) schedule = { ...schedule, days: schedule.days.map((day) => ({ ...day, question_ids: day.question_ids.filter((id) => id !== removedQuestionId) })) };
    if (coverage.uncoveredMustRequirementIds.length === 0) {
      try { schedule = buildStudySchedule({ daysAvailable: schedule.days_available, role, requirements: role.requirements, questions }).schedule; } catch { scheduleStale = true; }
    } else scheduleStale = true;
  }
  const coverageOutput = { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes: Number((record.coverage as { passes?: number } | null)?.passes ?? 1) };
  record.set("coverage", coverageOutput);
  record.set("schedule", schedule);
  record.set("derivedState", { coverageStale: false, scheduleStale, updatedAt: new Date().toISOString() });
  updateExternal(record, role, questions, flashcardSchema.array().parse(record.flashcards ?? []), coverageOutput, schedule);
}

export async function save(record: KitRecordDocument): Promise<void> { record.revision = (record.revision ?? 0) + 1; await record.save(); }

export async function updateCompanyBrief(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const body = companyBriefUpdateSchema.parse(req.body); assertRevision(record, body.expectedRevision);
  const currentKit = (record.kit as Record<string, unknown> | null) ?? {}; const current = (currentKit.company_brief as { summary: string; what_they_do: string; sources: string[] } | undefined) ?? { summary: "", what_they_do: "", sources: [] };
  const meta = editor(record); record.set("kit", { ...currentKit, company_brief: { ...current, summary: body.summary ?? current.summary, what_they_do: body.what_they_do ?? current.what_they_do } }); record.set("editorMetadata", { ...meta, companyBriefMeta: { ...(meta.companyBriefMeta as Record<string, boolean> | undefined), summaryEdited: body.summary !== undefined ? true : (meta.companyBriefMeta as { summaryEdited?: boolean } | undefined)?.summaryEdited ?? false, whatTheyDoEdited: body.what_they_do !== undefined ? true : (meta.companyBriefMeta as { whatTheyDoEdited?: boolean } | undefined)?.whatTheyDoEdited ?? false } }); await save(record); res.json(response(record));
}

export async function updateQuestion(req: Request, res: Response): Promise<void> {
  const questionId = paramId(req, "questionId"); const record = await owned(req); const body = questionUpdateSchema.parse(req.body); assertRevision(record, body.expectedRevision); const role = roleOf(record); const questions = questionSchema.array().parse(record.questions ?? []); const index = questions.findIndex((question) => question.id === questionId); if (index < 0) throw new AppError("NOT_FOUND", "Question not found", 404, { expose: true });
  const before = questions[index]!; validReferences(body.requirement_ids ?? before.requirement_ids, role); const after = questionSchema.parse({ ...before, ...body, expectedRevision: undefined });
  const metadata = normalizeMetadata(questions, record.questionMetadata, "q"); const entry = metadata[index]!; const changed = hasQuestionContentChanged(before, after); if (changed) { questions[index] = after; entry.edited = entry.origin === "generated" ? true : entry.edited; if (after.category !== before.category) entry.order = Math.max(-1, ...metadata.filter((item) => item.id !== before.id && questions.find((question) => question.id === item.id)?.category === after.category).map((item) => item.order)) + 1; derive(record, role, questions); }
  record.set("questionMetadata", metadata); if (changed) await save(record); res.json(response(record));
}

export async function createQuestion(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const body = questionCreateSchema.parse(req.body); assertRevision(record, body.expectedRevision); const role = roleOf(record); validReferences(body.requirement_ids, role); const questions = questionSchema.array().parse(record.questions ?? []); const metadata = normalizeMetadata(questions, record.questionMetadata, "q"); const deleted = ((editor(record).deletedQuestionIds as string[] | undefined) ?? []); const id = nextExportId(questions, deleted, "q"); const question = questionSchema.parse({ id, requirement_ids: body.requirement_ids, category: body.category, prompt: body.prompt, answer_outline: body.answer_outline, difficulty: body.difficulty }); questions.push(question); metadata.push(createMetadata(id, "q", "user", metadata.length)); record.set("questions", questions); record.set("questionMetadata", metadata); derive(record, role, questions); record.set("editorMetadata", { ...editor(record), deletedQuestionIds: deleted }); await save(record); res.status(201).json(response(record));
}

export async function deleteQuestion(req: Request, res: Response): Promise<void> {
  const questionId = paramId(req, "questionId"); const record = await owned(req); const body = expectedRevisionSchema.parse(req.body); assertRevision(record, body.expectedRevision); const role = roleOf(record); const questions = questionSchema.array().parse(record.questions ?? []); if (!questions.some((question) => question.id === questionId)) throw new AppError("NOT_FOUND", "Question not found", 404, { expose: true }); const next = questions.filter((question) => question.id !== questionId); const metadata = normalizeMetadata(questions, record.questionMetadata, "q").filter((entry) => entry.id !== questionId); const data = editor(record); record.set("questions", next); record.set("questionMetadata", metadata); record.set("editorMetadata", { ...data, deletedQuestionIds: [...((data.deletedQuestionIds as string[] | undefined) ?? []), questionId] }); derive(record, role, next, questionId); await save(record); res.json(response(record));
}

export async function reorderQuestions(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const body = reorderSchema.parse(req.body); assertRevision(record, body.expectedRevision); const questions = questionSchema.array().parse(record.questions ?? []); const currentIds = questions.map((question) => question.id); if (body.question_ids.length !== currentIds.length || new Set(body.question_ids).size !== currentIds.length || body.question_ids.some((id) => !currentIds.includes(id))) throw new AppError("VALIDATION_ERROR", "Reorder must contain each existing question exactly once", 400, { expose: true }); const metadata = normalizeMetadata(questions, record.questionMetadata, "q"); body.question_ids.forEach((id, index) => { const entry = metadata.find((item) => item.id === id); if (entry) entry.order = index; }); const reordered = body.question_ids.map((id) => questions.find((question) => question.id === id)!); record.set("questions", reordered); record.set("questionMetadata", metadata); updateExternal(record, roleOf(record), reordered, flashcardSchema.array().parse(record.flashcards ?? []), record.coverage, record.schedule); await save(record); res.json(response(record));
}

async function flashcardMutation(req: Request, res: Response, action: "update" | "create" | "delete" | "pin"): Promise<void> {
  const flashcardId = paramId(req, "flashcardId"); const record = await owned(req); const role = roleOf(record); const flashcards = flashcardSchema.array().parse(record.flashcards ?? []); const metadata = normalizeMetadata(flashcards, record.flashcardMetadata, "f"); const body = (action === "create" ? flashcardCreateSchema.parse(req.body) : action === "pin" ? pinSchema.parse(req.body) : action === "delete" ? expectedRevisionSchema.parse(req.body) : flashcardUpdateSchema.parse(req.body)) as { expectedRevision: number; front?: string; back?: string; requirement_ids?: string[]; pinned?: boolean }; assertRevision(record, body.expectedRevision); const data = editor(record);
  if (action === "create") { validReferences(body.requirement_ids ?? [], role); const deleted = ((data.deletedFlashcardIds as string[] | undefined) ?? []); const id = nextExportId(flashcards, deleted, "f"); flashcards.push(flashcardSchema.parse({ id, front: body.front, back: body.back, requirement_ids: body.requirement_ids ?? [] })); metadata.push(createMetadata(id, "f", "user", metadata.length)); record.set("editorMetadata", { ...data, deletedFlashcardIds: deleted }); }
  else { const index = flashcards.findIndex((card) => card.id === flashcardId); if (index < 0) throw new AppError("NOT_FOUND", "Flashcard not found", 404, { expose: true }); if (action === "delete") { const [removed] = flashcards.splice(index, 1); record.set("editorMetadata", { ...data, deletedFlashcardIds: [...((data.deletedFlashcardIds as string[] | undefined) ?? []), removed!.id] }); metadata.splice(index, 1); } else if (action === "pin") metadata[index]!.pinned = body.pinned ?? false; else { validReferences(body.requirement_ids ?? flashcards[index]!.requirement_ids, role); flashcards[index] = flashcardSchema.parse({ ...flashcards[index], ...body, expectedRevision: undefined }); metadata[index]!.edited = true; } }
  record.set("flashcards", flashcards); record.set("flashcardMetadata", metadata); const currentKit = (record.kit as Record<string, unknown> | null) ?? {}; record.set("kit", { ...currentKit, flashcards }); await save(record); res.json(response(record));
}

export const updateFlashcard = (req: Request, res: Response) => flashcardMutation(req, res, "update");
export const createFlashcard = (req: Request, res: Response) => flashcardMutation(req, res, "create");
export const deleteFlashcard = (req: Request, res: Response) => flashcardMutation(req, res, "delete");
export const pinFlashcard = (req: Request, res: Response) => flashcardMutation(req, res, "pin");

export async function pinQuestion(req: Request, res: Response): Promise<void> { const questionId = paramId(req, "questionId"); const record = await owned(req); const body = pinSchema.parse(req.body); assertRevision(record, body.expectedRevision); const questions = questionSchema.array().parse(record.questions ?? []); if (!questions.some((question) => question.id === questionId)) throw new AppError("NOT_FOUND", "Question not found", 404, { expose: true }); const metadata = normalizeMetadata(questions, record.questionMetadata, "q"); const entry = metadata.find((item) => item.id === questionId)!; entry.pinned = body.pinned; record.set("questionMetadata", metadata); await save(record); res.json(response(record)); }
