import { z } from "zod";
export const confidenceSchema = z.number().int().min(1).max(3);
export const confidenceUpdateSchema = z.object({ confidence: confidenceSchema }).strict();
