import { z } from "zod";
import { REQUIREMENT_KINDS, REQUIREMENT_PRIORITIES } from "../../schemas/kit.js";

export const rawExtractionSchema = z.object({
  title: z.string().default(""),
  seniority: z.string().default(""),
  location: z.string().default(""),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.object({ text: z.string(), kind: z.enum(REQUIREMENT_KINDS), priority: z.enum(REQUIREMENT_PRIORITIES) })).default([]),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;
