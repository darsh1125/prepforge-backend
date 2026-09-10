import { z } from "zod";
import { inspectUrlPolicy } from "../retrieval/urlPolicy.js";
import type { SearchResult } from "./types.js";

const rawResultSchema = z.object({ title: z.string().optional(), url: z.string(), snippet: z.string().optional(), rank: z.number().int().positive().optional() });

export function canonicalizeSourceUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    if (url.port === (url.protocol === "http:" ? "80" : "443")) url.port = "";
    return url.toString();
  } catch { return undefined; }
}

export function normalizeSearchResults(raw: unknown): SearchResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const normalized: SearchResult[] = [];
  for (const value of raw) {
    const parsed = rawResultSchema.safeParse(value);
    if (!parsed.success) continue;
    const url = canonicalizeSourceUrl(parsed.data.url);
    if (!url || inspectUrlPolicy(url, "production").length > 0 || seen.has(url)) continue;
    seen.add(url);
    normalized.push({ title: parsed.data.title?.trim() || url, url, snippet: parsed.data.snippet?.trim() || "", rank: parsed.data.rank ?? normalized.length + 1 });
  }
  return normalized;
}
