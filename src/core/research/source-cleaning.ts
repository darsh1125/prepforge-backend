export const MAX_RESEARCH_SOURCE_CHARS = 12_000;

export function cleanResearchText(text: string, snippet: string): string {
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  if (cleaned.length <= MAX_RESEARCH_SOURCE_CHARS) return cleaned || snippet;
  return `${cleaned.slice(0, MAX_RESEARCH_SOURCE_CHARS)}\n[Source text truncated]`;
}
