import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { loadEnv } from "../config/env.js";
import { safeUser, clearSessionCookie, setSessionCookie } from "../core/auth/session.js";
import { AppError } from "../core/errors/appError.js";
import { User } from "../models/User.js";
import { loginRequestSchema, registerRequestSchema } from "../schemas/auth.js";

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerRequestSchema.parse(req.body);
  if (await User.exists({ email: input.email })) throw new AppError("EMAIL_ALREADY_EXISTS", "An account with that email already exists", 409, { expose: true });
  try {
    const user = await User.create({ email: input.email, passwordHash: await bcrypt.hash(input.password, loadEnv().BCRYPT_ROUNDS) });
    const result = safeUser(user);
    setSessionCookie(res, result);
    res.status(201).json({ user: result });
  } catch (error) {
    if (error instanceof Error && error.name === "MongoServerError" && "code" in error && error.code === 11000) throw new AppError("EMAIL_ALREADY_EXISTS", "An account with that email already exists", 409, { expose: true });
    throw error;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginRequestSchema.parse(req.body);
  const user = await User.findOne({ email: input.email });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401, { expose: true });
  const result = safeUser(user);
  setSessionCookie(res, result);
  res.json({ user: result });
}

export function logout(_req: Request, res: Response): void {
  clearSessionCookie(res);
  res.json({ success: true });
}

export function me(req: Request, res: Response): void {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true });
  res.json({ user: req.auth.user });
}
