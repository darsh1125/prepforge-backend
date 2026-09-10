import type { RequirementKind, RequirementPriority } from "../../schemas/kit.js";
import type { RawExtraction } from "./schemas.js";
import type { ExtractedRequirement, ExtractedRole } from "./types.js";

const STOP_WORDS = new Set("a an and are as at be by for from in is it of on or the to with your you we will our this that".split(" "));
const NEGATIVE = /\b(no|not|without|don't|do not|doesn't|does not|not required|not needed)\b/i;
const EXCLUDED = /health insurance|vacation|paid time off|remote work|hybrid work|salary|compensation|laptop|equipment|equal opportunity|reasonable accommodation|race|religion|gender identity|veteran|apply|send your resume/i;

function normalize(value: string): string { return value.replace(/\s+/g, " ").trim().replace(/[.。]+$/, ""); }
function evidenceTokens(value: string): string[] { return normalize(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").split(" ").map((token) => token.replace(/[.,;:!?]+$/, "")).filter((token) => token.length > 2 && !STOP_WORDS.has(token)); }
function supportedByJD(value: string, jd: string): boolean {
  const jdTokens = new Set(evidenceTokens(jd));
  const tokens = evidenceTokens(value);
  return tokens.length > 0 && tokens.some((token) => jdTokens.has(token));
}

function negatedInJD(value: string, jd: string): boolean {
  const first = evidenceTokens(value)[0];
  if (!first) return false;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:no|not|without)\\s+${escaped}(?:\\s+experience)?\\s+(?:is\\s+)?(?:required|needed)\\b`, "i").test(jd);
}

export function normalizeExtraction(raw: RawExtraction, jd: string): ExtractedRole {
  const title = normalize(raw.title);
  const seniority = normalize(raw.seniority);
  const location = normalize(raw.location);
  const responsibilities = [...new Set(raw.responsibilities.map(normalize).filter((value) => value && supportedByJD(value, jd) && !EXCLUDED.test(value)))];
  const seen = new Set<string>();
  const requirements: ExtractedRequirement[] = [];
  for (const item of raw.requirements) {
    const text = normalize(item.text);
    const key = evidenceTokens(text).join(" ");
    if (!text || !key || seen.has(key) || NEGATIVE.test(text) || negatedInJD(text, jd) || EXCLUDED.test(text) || !supportedByJD(text, jd)) continue;
    seen.add(key);
    requirements.push({ text, kind: item.kind as RequirementKind, priority: item.priority as RequirementPriority });
  }
  return { title: supportedByJD(title, jd) ? title : "", seniority: supportedByJD(seniority, jd) ? seniority : "", location: supportedByJD(location, jd) ? location : "", responsibilities, requirements };
}
