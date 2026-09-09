import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  LLM_API_KEY: z.string().default(""),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function loadEnv(): AppEnv {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

export function isProduction(env: AppEnv = loadEnv()): boolean {
  return env.NODE_ENV === "production";
}
