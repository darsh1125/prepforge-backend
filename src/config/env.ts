import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.string().default(""),
    SESSION_SECRET: z.string().default(""),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    LLM_API_KEY: z.string().default(""),
    LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),
    LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
    AUTH_COOKIE_NAME: z.string().min(1).default("pf_session"),
    AUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
    RETRIEVAL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    RETRIEVAL_MAX_BYTES: z.coerce.number().int().positive().default(4 * 1024 * 1024),
    RETRIEVAL_MAX_PAGES: z.coerce.number().int().positive().max(20).default(7),
    RETRIEVAL_MAX_REDIRECTS: z.coerce.number().int().min(0).max(8).default(4),
    SEARCH_API_URL: z.string().url().default("https://api.search.brave.com/res/v1/web/search"),
    SEARCH_API_KEY: z.string().default(""),
    GENERATION_STALE_MINUTES: z.coerce.number().int().positive().default(15),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be at least 32 characters in production",
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function resetEnvCache(): void {
  cached = undefined;
}

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

  const env = parsed.data;
  if (env.NODE_ENV !== "production" && env.SESSION_SECRET.length === 0) {
    env.SESSION_SECRET = "dev-only-session-secret-not-for-production";
    if (env.NODE_ENV === "development") {
      console.warn("[env] SESSION_SECRET is empty; using an insecure development default");
    }
  }

  cached = env;
  return cached;
}

export function isProduction(env: AppEnv = loadEnv()): boolean {
  return env.NODE_ENV === "production";
}
