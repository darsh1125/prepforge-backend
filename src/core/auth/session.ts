import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { isProduction, loadEnv } from "../../config/env.js";
import type { SafeUser } from "../../types/user.js";

type SessionPayload = { sub: string; email: string };

export function safeUser(user: { _id: { toString(): string }; email: string }): SafeUser {
  return { id: user._id.toString(), email: user.email };
}

function cookieOptions(): CookieOptions {
  const env = loadEnv();
  return { httpOnly: true, secure: isProduction(env), sameSite: isProduction(env) ? "none" : "lax", path: "/", maxAge: env.AUTH_TOKEN_TTL_SECONDS * 1000 };
}

export function setSessionCookie(res: Response, user: SafeUser): void {
  const env = loadEnv();
  const token = jwt.sign({ sub: user.id, email: user.email } satisfies SessionPayload, env.SESSION_SECRET, { expiresIn: env.AUTH_TOKEN_TTL_SECONDS });
  res.cookie(env.AUTH_COOKIE_NAME, token, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(loadEnv().AUTH_COOKIE_NAME, cookieOptions());
}

export function verifySession(token: string): SessionPayload {
  const payload = jwt.verify(token, loadEnv().SESSION_SECRET);
  if (typeof payload !== "object" || payload === null || typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("Invalid session payload");
  return { sub: payload.sub, email: payload.email };
}
