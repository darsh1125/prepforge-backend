import { loadEnv } from "../../config/env.js";
import { AppError } from "../errors/appError.js";
import { createLLMClient, type LLMClient } from "../llm/client.js";
import { buildJDExtractionRequest } from "./jd-prompt.js";
import { assignRequirementIds } from "./requirement-ids.js";
import { rawExtractionSchema } from "./schemas.js";
import { normalizeExtraction } from "./requirement-normalizer.js";
import type { JDExtractionResult } from "./types.js";

export async function extractJobDescription(jd: string, client: LLMClient = createLLMClient()): Promise<JDExtractionResult> {
  if (!jd.trim()) throw new AppError("VALIDATION_ERROR", "Job description is required", 400, { expose: true });
  let attempts = 0;
  let lastError = "";
  while (attempts < 2) {
    attempts += 1;
    try {
      const raw = await client.generateStructured<unknown>(buildJDExtractionRequest(jd, lastError || undefined));
      const parsed = rawExtractionSchema.safeParse(raw);
      if (!parsed.success) { lastError = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "); continue; }
      const role = assignRequirementIds(normalizeExtraction(parsed.data, jd));
      const warnings = role.requirements.length === 0 ? [{ code: "NO_EXPLICIT_REQUIREMENTS", message: "No explicit candidate requirements were found in the job description", recoverable: true }] : [];
      return { role, warnings, metadata: { provider: "openai-compatible", model: loadEnv().LLM_MODEL, attempts, extractedAt: new Date().toISOString(), jdChars: jd.length } };
    } catch (error) {
      const code = error instanceof Error ? error.message : "LLM_UNAVAILABLE";
      if (code === "LLM_RATE_LIMITED" || code === "LLM_UNAVAILABLE") throw new AppError(code, "JD extraction provider is unavailable", 503, { expose: true });
      lastError = code;
    }
  }
  throw new AppError("JD_EXTRACTION_FAILED", "Job description extraction failed validation after one repair attempt", 502, { details: { attempts, reason: lastError }, expose: true });
}
