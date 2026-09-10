import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../config/env.js";
import { AppError } from "../core/errors/appError.js";

export function checkOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && origin !== loadEnv().WEB_ORIGIN) return next(new AppError("FORBIDDEN", "Request origin is not allowed", 403, { expose: true }));
  next();
}
