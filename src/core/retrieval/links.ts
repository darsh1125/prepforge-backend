import * as cheerio from "cheerio";
import { rankLinks, scoreLink } from "./rank-links.js";
import type { RetrievedLink } from "./types.js";

export function extractLinks(html: string, baseUrl: string, depth: number): RetrievedLink[] {
  const $ = cheerio.load(html);
  const links = new Map<string, RetrievedLink>();
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      url.hash = "";
      if (url.port === (url.protocol === "http:" ? "80" : "443")) url.port = "";
      if (url.pathname === "/") url.pathname = "";
      const canonical = url.toString();
      if (!links.has(canonical)) links.set(canonical, { url: canonical, text: $(element).text().replace(/\s+/g, " ").trim(), score: scoreLink($(element).text(), canonical, depth), depth });
    } catch { /* Ignore malformed hrefs. */ }
  });
  return rankLinks([...links.values()]);
}
