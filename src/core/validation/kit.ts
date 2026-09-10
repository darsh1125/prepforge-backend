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

export function validateFinalInterviewKit(input: unknown): KitValidationResult {
  const base = validateInterviewKit(input);
  if (!base.ok) return base;
  const kit = base.kit;
  const issues: { path: string; message: string }[] = [];
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) issues.push({ path, message: "IDs must be unique" }); };
  unique(kit.role.requirements.map((requirement) => requirement.id), "role.requirements");
  unique(kit.questions.map((question) => question.id), "questions");
  unique(kit.flashcards.map((flashcard) => flashcard.id), "flashcards");
  if (kit.schedule.days.length !== kit.schedule.days_available) issues.push({ path: "schedule.days", message: "Schedule must contain exactly days_available entries" });
  kit.schedule.days.forEach((day, index) => { if (day.day !== index + 1) issues.push({ path: `schedule.days.${index}.day`, message: "Schedule day numbers must be sequential" }); });
  const actualUncovered = kit.role.requirements.filter((requirement) => !kit.questions.some((question) => question.requirement_ids.includes(requirement.id))).map((requirement) => requirement.id);
  if (actualUncovered.join(",") !== kit.coverage.uncovered_requirement_ids.join(",")) issues.push({ path: "coverage.uncovered_requirement_ids", message: "Coverage does not match question references" });
  if (kit.role.requirements.some((requirement) => requirement.priority === "must" && kit.coverage.uncovered_requirement_ids.includes(requirement.id))) issues.push({ path: "coverage", message: "Must-have requirements cannot remain uncovered" });
  const scheduledQuestionIds = new Set(kit.schedule.days.flatMap((day) => day.question_ids));
  for (const requirement of kit.role.requirements.filter((candidate) => candidate.priority === "must")) if (!kit.questions.some((question) => scheduledQuestionIds.has(question.id) && question.requirement_ids.includes(requirement.id))) issues.push({ path: "schedule", message: `Must-have requirement ${requirement.id} is not scheduled` });
  if (kit.source.pages_used.some((url) => !url.startsWith("http://") && !url.startsWith("https://"))) issues.push({ path: "source.pages_used", message: "Source URLs must use HTTP or HTTPS" });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, kit };
}

export function assertValidFinalInterviewKit(input: unknown): InterviewKit {
  const result = validateFinalInterviewKit(input);
  if (!result.ok) throw new AppError("KIT_VALIDATION_FAILED", "Final interview kit failed validation", 422, { details: result.issues, expose: true });
  return result.kit;
}
