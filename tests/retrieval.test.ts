import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlCompanySite } from "../src/core/retrieval/crawl-company.js";
import { fetchPage } from "../src/core/retrieval/fetch-page.js";
import { rankLinks } from "../src/core/retrieval/rank-links.js";
import { inspectUrlPolicy, isUrlAllowed } from "../src/core/retrieval/urlPolicy.js";
import type { RetrievedLink } from "../src/core/retrieval/types.js";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path === "/robots.txt") { response.writeHead(200, { "content-type": "text/plain" }); response.end("User-agent: *\nDisallow: /private-careers\n"); return; }
    if (path === "/redirect") { response.writeHead(302, { location: "/" }); response.end(); return; }
    if (path === "/broken") { response.writeHead(500, { "content-type": "text/html" }); response.end("broken"); return; }
    if (path === "/private-careers") { response.writeHead(200, { "content-type": "text/html" }); response.end("should not fetch"); return; }
    if (path === "/company/join-us") { response.writeHead(200, { "content-type": "text/html" }); response.end("<html><title>Join Us</title><body><h1>Build with us</h1></body></html>"); return; }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<html><head><title>Acme</title><meta property="og:site_name" content="Acme"></head><body><script>bad()</script><h1>Acme</h1><a href="/company/join-us">Build With Us</a><a href="/private-careers">Private Careers</a><a href="/broken">Broken</a><a href="/redirect">Redirect</a></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

describe("retrieval URL policy", () => {
  it("accepts HTTP(S) and blocks unsafe production targets", () => {
    expect(isUrlAllowed("https://example.com", "production")).toBe(true);
    expect(isUrlAllowed("ftp://example.com", "production")).toBe(false);
    expect(isUrlAllowed("http://localhost:8099", "production")).toBe(false);
    expect(isUrlAllowed("http://127.0.0.1:8099", "production")).toBe(false);
    expect(inspectUrlPolicy("http://localhost:8099", "evaluator")).toEqual([]);
  });
});

describe("company crawler", () => {
  it("fetches HTML, cleans scripts, follows redirects, and resolves links", async () => {
    const fetched = await fetchPage(`${baseUrl}/redirect`, "evaluator", { retries: 0 });
    expect(fetched.page?.title).toBe("Acme");
    expect(fetched.page?.text).not.toContain("bad()");
    expect(fetched.page?.links.some((link) => link.url.endsWith("/company/join-us"))).toBe(true);
  });

  it("discovers nonstandard hiring links, respects robots, and keeps partial successes", async () => {
    const result = await crawlCompanySite({ companyUrl: baseUrl, mode: "evaluator", options: { maxPages: 4, maxDepth: 1, retries: 0, delayMs: 0 } });
    expect(result.pagesUsed.some((url) => url.endsWith("/company/join-us"))).toBe(true);
    expect(result.pagesUsed.some((url) => url.endsWith("/private-careers"))).toBe(false);
    expect(result.warnings.some((warning) => warning.code === "HTTP_500")).toBe(true);
    expect(result.pages.length).toBeGreaterThan(1);
  });

  it("ranks relevant links above utility links", () => {
    const links: RetrievedLink[] = [
      { url: "https://example.com/privacy", text: "Privacy Policy", score: 0, depth: 1 },
      { url: "https://example.com/company/join-us", text: "Build With Us", score: 0, depth: 1 },
    ];
    expect(rankLinks(links)[0]?.url).toContain("join-us");
  });
});
