import { interviewKitSchema, type InterviewKit } from "../../schemas/kit.js";
import { AppError } from "../errors/appError.js";
import { validateReferentialIntegrity } from "./referentialIntegrity.js";

export type KitValidationResult =
  | { ok: true; kit: InterviewKit }
  | { ok: false; issues: { path: string; message: string }[] };

export function validateInterviewKit(input: unknown): KitValidationResult {
  const parsed = interviewKitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const referential = validateReferentialIntegrity(parsed.data);
  if (referential.length > 0) {
    return { ok: false, issues: referential };
  }

  return { ok: true, kit: parsed.data };
}

export function assertValidInterviewKit(input: unknown): InterviewKit {
  const result = validateInterviewKit(input);
  if (!result.ok) {
    throw new AppError("KIT_VALIDATION_FAILED", "Interview kit failed validation", 422, {
      details: result.issues,
      expose: true,
    });
  }
  return result.kit;
}
