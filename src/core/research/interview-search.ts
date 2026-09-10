import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { fetchPage } from "../retrieval/fetch-page.js";
import { cleanResearchText } from "./source-cleaning.js";
import { canonicalizeSourceUrl, normalizeSearchResults } from "./source-discovery.js";
import { rankSearchResults } from "./source-ranking.js";
import type { InterviewResearchInput, InterviewResearchResult, ResearchAuthority, ResearchSourceType, ResearchWarning, SearchProvider, SearchResult } from "./types.js";

const braveResponseSchema = z.object({ web: z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), description: z.string().optional() })) }) });

export class BraveSearchProvider implements SearchProvider {
  async search(query: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const env = loadEnv();
    if (!env.SEARCH_API_KEY) throw new Error("SEARCH_PROVIDER_UNAVAILABLE");
    const endpoint = new URL(env.SEARCH_API_URL);
    endpoint.searchParams.set("q", query); endpoint.searchParams.set("count", String(options.limit ?? 8));
    const response = await fetch(endpoint, { signal: options.signal, headers: { Accept: "application/json", "X-Subscription-Token": env.SEARCH_API_KEY, "User-Agent": "PrepForgeInterviewResearch/1.0" } });
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (!response.ok) throw new Error("INTERVIEW_SEARCH_UNAVAILABLE");
    const parsed = braveResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("INVALID_SEARCH_RESPONSE");
    return normalizeSearchResults(parsed.data.web.results.map((result, index) => ({ title: result.title, url: result.url, snippet: result.description, rank: index + 1 })));
  }
}

export function buildInterviewQueries(input: InterviewResearchInput): string[] {
  const identifier = input.companyName?.trim() || new URL(input.companyUrl).hostname.replace(/^www\./i, "");
  const role = input.roleTitle?.trim();
  const base = [`${identifier} interview process`, `${identifier} software engineer interview`, `${identifier} technical interview`, `${identifier} interview experience`, `${identifier} hiring process`];
  if (role) base.splice(1, 0, `${identifier} ${role} interview`);
  if (input.location?.trim()) base.push(`${identifier} software engineer interview ${input.location.trim()}`);
  return [...new Set(base.map((query) => query.replace(/\s+/g, " ").trim()))].slice(0, 5);
}

function classifySource(url: string, companyUrl: string, title: string): { sourceType: ResearchSourceType; authority: ResearchAuthority } {
  const host = new URL(url).hostname.replace(/^www\./i, "");
  const companyHost = new URL(companyUrl).hostname.replace(/^www\./i, "");
  if (host === companyHost) return { sourceType: "company", authority: "official" };
  if (/reddit\.com$/i.test(host)) return { sourceType: "reddit", authority: "community" };
  if (/forum|quora|glassdoor|blind/i.test(host)) return { sourceType: "forum", authority: "community" };
  if (/interview|experience|hiring/i.test(title)) return { sourceType: "interview-review", authority: "first-person-public" };
  if (/blog/i.test(host)) return { sourceType: "blog", authority: "secondary" };
  return { sourceType: "other-public", authority: "unknown" };
}

export async function researchInterview(input: InterviewResearchInput, provider: SearchProvider = new BraveSearchProvider()): Promise<InterviewResearchResult> {
  const startedAt = new Date().toISOString();
  const identifier = input.companyName?.trim() || new URL(input.companyUrl).hostname;
  const queries = buildInterviewQueries(input);
  const warnings: ResearchWarning[] = [];
  const rawResults: SearchResult[] = [];
  for (const query of queries) {
    try { rawResults.push(...normalizeSearchResults(await provider.search(query, { limit: 8 }))); }
    catch (error) { warnings.push({ code: error instanceof Error && error.message === "RATE_LIMITED" ? "RATE_LIMITED" : error instanceof Error && error.message === "INVALID_SEARCH_RESPONSE" ? "INVALID_SEARCH_RESPONSE" : "INTERVIEW_SEARCH_UNAVAILABLE", message: `Search provider failed for query: ${query}`, stage: "search", recoverable: true }); }
  }
  const deduped = new Map<string, SearchResult>();
  for (const result of rankSearchResults(rawResults, identifier, input.roleTitle)) { const url = canonicalizeSourceUrl(result.url); if (url && !deduped.has(url)) deduped.set(url, { ...result, url }); }
  const candidates = [...deduped.values()].slice(0, 5);
  const sources = [];
  let failedFetches = 0;
  for (const candidate of candidates) {
    const fetched = await fetchPage(candidate.url, input.mode, { retries: 1 });
    if (!fetched.page) { failedFetches += 1; warnings.push({ code: fetched.warning?.code === "ROBOTS_DISALLOWED" ? "ROBOTS_DISALLOWED" : "SOURCE_FETCH_FAILED", message: fetched.warning?.message || "Source could not be fetched", url: candidate.url, stage: "source-fetch", recoverable: true }); continue; }
    const classification = classifySource(candidate.url, input.companyUrl, candidate.title);
    sources.push({ sourceId: `s${sources.length + 1}`, title: candidate.title, url: fetched.page.url, domain: new URL(fetched.page.url).hostname, snippet: candidate.snippet || "", sourceType: classification.sourceType, authority: classification.authority, cleanedText: cleanResearchText(fetched.page.text, candidate.snippet || ""), fetchedAt: fetched.page.fetchedAt, relevanceScore: candidate.rank });
  }
  if (sources.length === 0) warnings.push({ code: "NO_PUBLIC_INTERVIEW_SOURCES", message: "No usable public interview sources were found", stage: "research", recoverable: true });
  return { companyIdentifier: identifier, queries, sources, warnings, metadata: { startedAt, completedAt: new Date().toISOString(), sourceCount: sources.length, successfulFetches: sources.length, failedFetches } };
}
