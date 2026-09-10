import type { SearchResult } from "./types.js";

const POSITIVE = /interview|hiring|technical|coding|system design|behavioral|experience|recruiter|onsite|engineer/i;
const NEGATIVE = /top \d+|generic|pricing|course|template|job listing|resume/i;

export function scoreSearchResult(result: SearchResult, companyIdentifier: string, roleTitle?: string): number {
  const text = `${result.title} ${result.snippet} ${result.url}`;
  let score = Math.max(0, 10 - result.rank);
  if (new RegExp(companyIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) score += 8;
  if (POSITIVE.test(text)) score += 5;
  if (roleTitle && new RegExp(roleTitle.split(/\s+/).filter(Boolean).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i").test(text)) score += 3;
  if (NEGATIVE.test(text)) score -= 6;
  return score;
}

export function rankSearchResults(results: SearchResult[], companyIdentifier: string, roleTitle?: string): SearchResult[] {
  return results.map((result) => ({ ...result, rank: scoreSearchResult(result, companyIdentifier, roleTitle) })).sort((a, b) => b.rank - a.rank || a.url.localeCompare(b.url));
}
