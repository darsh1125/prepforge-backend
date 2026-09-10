import * as cheerio from "cheerio";

export function cleanHtml(html: string): { title: string; text: string; metadata: Record<string, string> } {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, template, iframe").remove();
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const metadata: Record<string, string> = {};
  $("meta").each((_index, element) => {
    const name = ($(element).attr("property") ?? $(element).attr("name") ?? "").toLowerCase();
    const content = $(element).attr("content")?.trim();
    if (content && ["og:site_name", "application-name"].includes(name)) metadata[name] = content;
  });
  const text = $("body").text().replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { title, text, metadata };
}
