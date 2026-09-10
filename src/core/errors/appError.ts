export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_CREDENTIALS",
  "EMAIL_ALREADY_EXISTS",
  "COMPANY_UNREACHABLE",
  "LLM_RATE_LIMITED",
  "LLM_INVALID_RESPONSE",
  "LLM_UNAVAILABLE",
  "LLM_RATE_LIMITED",
  "JD_EXTRACTION_FAILED",
  "ROLE_EXTRACTION_REQUIRED",
  "SCHEDULE_GENERATION_FAILED",
  "GENERATION_ALREADY_IN_PROGRESS",
  "KIT_VERSION_CONFLICT",
  "REGENERATION_FAILED",
  "PRACTICE_STATE_UPDATE_FAILED",
  "KIT_VALIDATION_FAILED",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 500,
    options?: { details?: unknown; expose?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = options?.details;
    this.expose = options?.expose ?? statusCode < 500;
  }
}

export type PipelineIssue = {
  code: string;
  message: string;
  stage?: string;
  recoverable?: boolean;
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
