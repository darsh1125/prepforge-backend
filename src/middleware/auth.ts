import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../config/env.js";
import { safeUser, verifySession } from "../core/auth/session.js";
import { AppError } from "../core/errors/appError.js";
import { User } from "../models/User.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[loadEnv().AUTH_COOKIE_NAME];
    if (!token) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true });
    const session = verifySession(token);
    const user = await User.findById(session.sub).select("email").lean();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true });
    req.auth = { userId: user._id.toString(), user: safeUser(user) };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true }));
  }
}
