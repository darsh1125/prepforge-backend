import { cleanHtml } from "./clean-html.js";
import { extractLinks } from "./links.js";
import { inspectResolvedUrlPolicy, type UrlFetchMode } from "./urlPolicy.js";
import type { FetchedPage, RetrievalWarning } from "./types.js";

export const DEFAULT_RETRIEVAL_OPTIONS = { timeoutMs: 10_000, maxBytes: 4 * 1024 * 1024, maxRedirects: 4, retries: 2 };
export type FetchPageOptions = { timeoutMs: number; maxBytes: number; maxRedirects: number; retries: number };

type RawResponse = { response: Response; body: string };

async function request(url: string, mode: UrlFetchMode, options: FetchPageOptions): Promise<RawResponse> {
  let current = url;
  for (let redirect = 0; redirect <= options.maxRedirects; redirect += 1) {
    const issues = await inspectResolvedUrlPolicy(current, mode);
    if (issues.length > 0) throw new Error(issues.map((issue) => issue.code).join(","));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "PrepForgeInterviewResearch/1.0", Accept: "text/html,text/plain;q=0.8" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === options.maxRedirects) throw new Error(redirect === options.maxRedirects ? "REDIRECT_LIMIT" : "REDIRECT_MISSING_LOCATION");
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.body) return { response, body: await response.text() };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let total = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > options.maxBytes) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); }
        chunks.push(chunk.value);
      }
      return { response, body: Buffer.concat(chunks).toString("utf8") };
    } finally { clearTimeout(timeout); }
  }
  throw new Error("REDIRECT_LIMIT");
}

export async function fetchPage(url: string, mode: UrlFetchMode, options: Partial<FetchPageOptions> = {}): Promise<{ page?: FetchedPage; warning?: RetrievalWarning; response?: Response; body?: string }> {
  const settings = { ...DEFAULT_RETRIEVAL_OPTIONS, ...options };
  for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
    try {
      const result = await request(url, mode, settings);
      const contentType = result.response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!result.response.ok) {
        const retryable = [429, 502, 503, 504].includes(result.response.status);
        if (retryable && attempt < settings.retries) { await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt)); continue; }
        return { warning: { code: `HTTP_${result.response.status}`, message: `Company page returned HTTP ${result.response.status}`, url, stage: "fetch", recoverable: true }, response: result.response, body: result.body };
      }
      if (contentType !== "text/html" && contentType !== "text/plain") return { warning: { code: "UNSUPPORTED_CONTENT_TYPE", message: `Skipped unsupported content type ${contentType || "unknown"}`, url, stage: "fetch", recoverable: true } };
      const finalUrl = result.response.url || url;
      const parsed = contentType === "text/html" ? cleanHtml(result.body) : { title: "", text: result.body.replace(/\s+/g, " ").trim(), metadata: {} };
      return { page: { url: finalUrl, statusCode: result.response.status, contentType, title: parsed.title, text: parsed.text, links: contentType === "text/html" ? extractLinks(result.body, finalUrl, 0) : [], fetchedAt: new Date().toISOString() }, response: result.response, body: result.body };
    } catch (error) {
      const code = error instanceof Error ? error.message : "FETCH_FAILED";
      const retryable = !["RESPONSE_TOO_LARGE", "REDIRECT_LIMIT"].includes(code);
      if (retryable && attempt < settings.retries) { await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt)); continue; }
      return { warning: { code, message: `Could not fetch company page: ${code}`, url, stage: "fetch", recoverable: true } };
    }
  }
  return { warning: { code: "FETCH_FAILED", message: "Could not fetch company page", url, stage: "fetch", recoverable: true } };
}
