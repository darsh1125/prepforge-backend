import type { UrlFetchMode } from "../retrieval/urlPolicy.js";

export type SearchResult = { title: string; url: string; snippet?: string; rank: number };

export type SearchProvider = {
  search: (query: string, options?: { limit?: number; signal?: AbortSignal }) => Promise<SearchResult[]>;
};

export type ResearchWarning = {
  code: string;
  message: string;
  url?: string;
  stage: string;
  recoverable: boolean;
};

export type ResearchSourceType = "company" | "blog" | "interview-review" | "forum" | "reddit" | "other-public";
export type ResearchAuthority = "official" | "first-person-public" | "community" | "secondary" | "unknown";

export type ResearchSource = {
  sourceId: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceType: ResearchSourceType;
  authority: ResearchAuthority;
  cleanedText: string;
  fetchedAt: string;
  relevanceScore: number;
};

export type InterviewResearchInput = {
  companyName?: string;
  companyUrl: string;
  roleTitle?: string;
  location?: string;
  mode: UrlFetchMode;
};

export type InterviewResearchResult = {
  companyIdentifier: string;
  queries: string[];
  sources: ResearchSource[];
  warnings: ResearchWarning[];
  metadata: { startedAt: string; completedAt: string; sourceCount: number; successfulFetches: number; failedFetches: number };
};
