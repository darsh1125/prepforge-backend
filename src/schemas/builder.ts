import { z } from "zod";
import { questionCategorySchema, requirementSchema } from "./kit.js";

export const revisionSchema = z.number().int().min(0);
export const expectedRevisionSchema = z.object({ expectedRevision: revisionSchema }).strict();
export const companyBriefUpdateSchema = z.object({ summary: z.string().trim().min(1).max(10_000).optional(), what_they_do: z.string().trim().min(1).max(10_000).optional(), expectedRevision: revisionSchema }).strict().refine((value) => value.summary !== undefined || value.what_they_do !== undefined, "At least one company brief field is required");
export const questionUpdateSchema = z.object({ prompt: z.string().min(1).max(5_000).optional(), answer_outline: z.string().min(1).max(12_000).optional(), difficulty: z.number().int().min(1).max(3).optional(), category: questionCategorySchema.optional(), requirement_ids: z.array(z.string().min(1)).max(30).optional(), expectedRevision: revisionSchema }).strict();
export const questionCreateSchema = z.object({ prompt: z.string().trim().min(1).max(5_000), answer_outline: z.string().trim().min(1).max(12_000), difficulty: z.number().int().min(1).max(3).default(2), category: questionCategorySchema.default("technical"), requirement_ids: z.array(z.string().min(1)).max(30).default([]), expectedRevision: revisionSchema }).strict();
export const reorderSchema = z.object({ question_ids: z.array(z.string().min(1)), expectedRevision: revisionSchema }).strict().refine((value) => new Set(value.question_ids).size === value.question_ids.length, "question_ids must be unique");
export const flashcardUpdateSchema = z.object({ front: z.string().min(1).max(5_000).optional(), back: z.string().min(1).max(12_000).optional(), requirement_ids: z.array(z.string().min(1)).max(30).optional(), expectedRevision: revisionSchema }).strict();
export const flashcardCreateSchema = z.object({ front: z.string().trim().min(1).max(5_000), back: z.string().trim().min(1).max(12_000), requirement_ids: z.array(z.string().min(1)).max(30).default([]), expectedRevision: revisionSchema }).strict();
export const pinSchema = z.object({ pinned: z.boolean(), expectedRevision: revisionSchema }).strict();
export const requirementRefSchema = z.array(requirementSchema.shape.id).max(30);
