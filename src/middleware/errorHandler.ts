import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProduction, loadEnv } from "../config/env.js";
import { AppError, isAppError } from "../core/errors/appError.js";

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError("NOT_FOUND", "Route not found", 404, { expose: true }));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const env = loadEnv();
  const production = isProduction(env);

  if (err instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (isAppError(err)) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        details: err.expose || !production ? err.details : undefined,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[http]", err);

  const body: ErrorBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: production ? "An unexpected error occurred" : message,
    },
  };
  res.status(500).json(body);
}
