import { z } from "zod";

export const questionDraftSchema = z.object({
  requirement_ids: z.array(z.string().trim().min(1)),
  prompt: z.string().trim().min(1),
  answer_outline: z.string().trim().min(1),
  difficulty: z.number().int().min(1).max(3),
});
export const questionDraftResponseSchema = z.object({ questions: z.array(questionDraftSchema) });
