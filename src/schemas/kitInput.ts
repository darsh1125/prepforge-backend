import { z } from "zod";
import { inputDaysSchema } from "./kit.js";

export const kitInputSchema = z.object({
  jd: z.string().trim().min(1, "Job description is required"),
  company_url: z.string().trim().url("Enter a valid company URL").refine((value) => /^https?:\/\//i.test(value), "Company URL must use HTTP or HTTPS"),
  days: inputDaysSchema,
});
export const kitUpdateSchema = kitInputSchema.partial();
