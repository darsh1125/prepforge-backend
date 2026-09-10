import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address").transform((email) => email.toLowerCase());
export const registerRequestSchema = z.object({ email: emailSchema, password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long") });
export const loginRequestSchema = z.object({ email: emailSchema, password: z.string().min(1, "Password is required") });
