import type { RetrievedLink } from "./types.js";

const RELEVANT = /career|job|join|work with us|life at|people|team|culture|about|company|mission|value|hiring|interview|recruit|talent|engineer|technology|leadership/i;
const LOW_VALUE = /privacy|legal|terms|cookie|login|sign in|contact|blog|press|investor/i;

export function scoreLink(text: string, url: string, depth: number): number {
  const path = new URL(url).pathname;
  let score = 0;
  if (RELEVANT.test(text)) score += 5;
  if (RELEVANT.test(path)) score += 4;
  if (LOW_VALUE.test(text) || LOW_VALUE.test(path)) score -= 3;
  score -= depth;
  return score;
}

export function rankLinks(links: RetrievedLink[]): RetrievedLink[] {
  return [...links].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}
