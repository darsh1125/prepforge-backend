import { z } from "zod";

export const flashcardDraftSchema = z.object({
  front: z.string().trim().min(1),
  back: z.string().trim().min(1),
  requirement_ids: z.array(z.string().trim().min(1)),
});

export const flashcardDraftResponseSchema = z.object({
  flashcards: z.array(flashcardDraftSchema),
});
