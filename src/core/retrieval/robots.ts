import type { UrlFetchMode } from "./urlPolicy.js";
import { inspectResolvedUrlPolicy } from "./urlPolicy.js";
import type { RetrievalWarning } from "./types.js";

type Rule = { allow: boolean; path: string };

export class RobotsRules {
  constructor(private readonly rules: Rule[]) {}
  allows(url: string): boolean {
    const path = new URL(url).pathname;
    const matches = this.rules.filter((rule) => path.startsWith(rule.path));
    if (matches.length === 0) return true;
    const best = matches.sort((a, b) => b.path.length - a.path.length)[0];
    return best?.allow ?? true;
  }
}

export async function loadRobots(origin: string, mode: UrlFetchMode, fetchText: (url: string) => Promise<{ status: number; text?: string }>): Promise<{ rules: RobotsRules; warnings: RetrievalWarning[] }> {
  const url = new URL("/robots.txt", origin).toString();
  const warnings: RetrievalWarning[] = [];
  if ((await inspectResolvedUrlPolicy(url, mode)).length > 0) return { rules: new RobotsRules([]), warnings };
  try {
    const response = await fetchText(url);
    if (response.status === 404) return { rules: new RobotsRules([]), warnings };
    if (response.status < 200 || response.status >= 300 || !response.text) {
      warnings.push({ code: "ROBOTS_UNAVAILABLE", message: "robots.txt could not be read; continuing with a bounded crawl", url, stage: "robots", recoverable: true });
      return { rules: new RobotsRules([]), warnings };
    }
    const rules: Rule[] = [];
    let applies = false;
    for (const rawLine of response.text.split(/\r?\n/)) {
      const line = rawLine.split("#")[0]?.trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey?.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") applies = value === "*" || /prepforge/i.test(value);
      if (applies && (key === "disallow" || key === "allow") && value) rules.push({ allow: key === "allow", path: value });
    }
    return { rules: new RobotsRules(rules), warnings };
  } catch {
    warnings.push({ code: "ROBOTS_UNAVAILABLE", message: "robots.txt could not be read; continuing with a bounded crawl", url, stage: "robots", recoverable: true });
    return { rules: new RobotsRules([]), warnings };
  }
}
