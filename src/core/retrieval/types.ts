import type { UrlFetchMode } from "./urlPolicy.js";

export type RetrievalWarning = {
  code: string;
  message: string;
  url?: string;
  stage: string;
  recoverable: boolean;
};

export type RetrievedLink = {
  url: string;
  text: string;
  score: number;
  depth: number;
};

export type FetchedPage = {
  url: string;
  statusCode: number;
  contentType: string;
  title: string;
  text: string;
  links: RetrievedLink[];
  fetchedAt: string;
};

export type CompanyCrawlOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxPages?: number;
  maxDepth?: number;
  maxRedirects?: number;
  retries?: number;
  delayMs?: number;
};

export type CrawlCompanyInput = {
  companyUrl: string;
  mode: UrlFetchMode;
  options?: CompanyCrawlOptions;
};

export type CompanyCrawlResult = {
  requestedUrl: string;
  finalUrl?: string;
  pages: FetchedPage[];
  pagesUsed: string[];
  warnings: RetrievalWarning[];
  metadata: { companyNameHint?: string };
};
