import type { InterviewKit } from "../../schemas/kit.js";
import type { PipelineIssue } from "../errors/appError.js";
import { AppError } from "../errors/appError.js";
import { inputDaysSchema } from "../../schemas/kit.js";
import type { UrlFetchMode } from "../retrieval/urlPolicy.js";
import { inspectUrlPolicy } from "../retrieval/urlPolicy.js";

export type GenerateKitInput = {
  jd: string;
  company_url: string;
  days: number;
  fetchMode?: UrlFetchMode;
};

export type GenerateKitResult = {
  kit: InterviewKit;
  warnings: PipelineIssue[];
  status: "completed" | "completed_with_warnings";
};

/**
 * Shared generation entry point for the Express API and the CLI evaluator.
 * Do not create a second duplicate implementation for either caller.
 */
export async function generateKit(input: GenerateKitInput): Promise<GenerateKitResult> {
  const days = inputDaysSchema.safeParse(input.days);
  if (!days.success) {
    throw new AppError("VALIDATION_ERROR", "days must be an integer between 1 and 60", 400, {
      details: days.error.issues,
      expose: true,
    });
  }

  const fetchMode = input.fetchMode ?? "production";
  const urlIssues = inspectUrlPolicy(input.company_url, fetchMode);
  if (urlIssues.length > 0 && fetchMode === "production") {
    throw new AppError("VALIDATION_ERROR", "company_url failed retrieval policy checks", 400, {
      details: urlIssues,
      expose: true,
    });
  }

  throw new AppError(
    "NOT_IMPLEMENTED",
    "Kit generation is not implemented yet. The API and CLI evaluator will both call generateKit().",
    501,
    { expose: true },
  );
}
