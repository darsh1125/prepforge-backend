import { fetchPage } from "./fetch-page.js";
import { loadRobots } from "./robots.js";
import { rankLinks } from "./rank-links.js";
import type { CrawlCompanyInput, CompanyCrawlOptions, CompanyCrawlResult } from "./types.js";
import { inspectResolvedUrlPolicy } from "./urlPolicy.js";
import { loadEnv } from "../../config/env.js";

function defaultOptions(): Required<CompanyCrawlOptions> {
  const env = loadEnv();
  return { timeoutMs: env.RETRIEVAL_TIMEOUT_MS, maxBytes: env.RETRIEVAL_MAX_BYTES, maxPages: env.RETRIEVAL_MAX_PAGES, maxRedirects: env.RETRIEVAL_MAX_REDIRECTS, retries: 2, maxDepth: 1, delayMs: 50 };
}

export async function crawlCompanySite(input: CrawlCompanyInput): Promise<CompanyCrawlResult> {
  const options = { ...defaultOptions(), ...input.options };
  const result: CompanyCrawlResult = { requestedUrl: input.companyUrl, pages: [], pagesUsed: [], warnings: [], metadata: {} };
  const initialIssues = await inspectResolvedUrlPolicy(input.companyUrl, input.mode);
  if (initialIssues.length > 0) {
    result.warnings.push({ code: "COMPANY_UNREACHABLE", message: initialIssues.map((issue) => issue.message).join("; "), url: input.companyUrl, stage: "validate", recoverable: false });
    return result;
  }
  const homepage = await fetchPage(input.companyUrl, input.mode, options);
  if (!homepage.page) {
    if (homepage.warning) result.warnings.push({ ...homepage.warning, code: "COMPANY_UNREACHABLE", recoverable: false });
    return result;
  }
  const homepagePage = homepage.page;
  result.finalUrl = homepagePage.url;
  result.pages.push(homepagePage); result.pagesUsed.push(homepagePage.url);
  result.metadata.companyNameHint = homepagePage.title || new URL(homepagePage.url).hostname;
  const robots = await loadRobots(homepagePage.url, input.mode, async (url) => {
    const response = await fetchPage(url, input.mode, { ...options, retries: 0 });
    return { status: response.response?.status ?? 0, text: response.body };
  });
  result.warnings.push(...robots.warnings);
  const seen = new Set(result.pagesUsed);
  let candidates = homepagePage.links.filter((link) => new URL(link.url).hostname === new URL(homepagePage.url).hostname);
  for (let depth = 1; depth <= options.maxDepth && result.pages.length < options.maxPages; depth += 1) {
    candidates = rankLinks(candidates);
    for (const candidate of candidates) {
      if (result.pages.length >= options.maxPages) break;
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      if (!robots.rules.allows(candidate.url)) { result.warnings.push({ code: "ROBOTS_DISALLOWED", message: "Skipped page disallowed by robots.txt", url: candidate.url, stage: "robots", recoverable: true }); continue; }
      if (options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const fetched = await fetchPage(candidate.url, input.mode, options);
      if (fetched.warning) { result.warnings.push(fetched.warning); continue; }
      if (!fetched.page) continue;
      result.pages.push({ ...fetched.page, links: fetched.page.links.map((link) => ({ ...link, depth })) }); result.pagesUsed.push(fetched.page.url);
      if (depth < options.maxDepth) candidates.push(...fetched.page.links.filter((link) => new URL(link.url).hostname === new URL(homepage.page!.url).hostname));
    }
  }
  if (!result.pages.some((page) => /career|job|join|hiring|talent|recruit/i.test(`${page.title} ${page.url}`))) result.warnings.push({ code: "HIRING_PAGE_NOT_FOUND", message: "No likely hiring or careers page was found among the bounded crawl results", stage: "crawl", recoverable: true });
  return result;
}
