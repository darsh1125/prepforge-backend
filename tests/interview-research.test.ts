import { describe, expect, it } from "vitest";
import { buildInterviewQueries, researchInterview } from "../src/core/research/interview-search.js";
import { normalizeSearchResults } from "../src/core/research/source-discovery.js";
import { rankSearchResults } from "../src/core/research/source-ranking.js";

describe("interview research", () => {
  it("generates bounded, role-aware queries without duplicates", () => {
    const queries = buildInterviewQueries({ companyName: "Acme", companyUrl: "https://acme.example", roleTitle: "Frontend Engineer", location: "India", mode: "production" });
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(queries.some((query) => query.includes("Frontend Engineer interview"))).toBe(true);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("normalizes, validates, and deduplicates provider results", () => {
    const results = normalizeSearchResults([
      { title: "Acme Interview Experience", url: "https://example.com/post#comments", snippet: "candidate report" },
      { title: "duplicate", url: "https://example.com/post" },
      { title: "bad", url: "javascript:alert(1)" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/post");
  });

  it("ranks company interview evidence above generic advice", () => {
    const ranked = rankSearchResults([
      { title: "Top 100 JavaScript Interview Questions", url: "https://example.com/questions", rank: 1 },
      { title: "Acme Engineering Interview Experience", url: "https://example.com/acme", rank: 5 },
    ], "Acme", "Frontend Engineer");
    expect(ranked[0]?.url).toContain("/acme");
  });

  it("returns an honest no-results packet", async () => {
    const result = await researchInterview({ companyName: "Acme", companyUrl: "https://acme.example", mode: "production" }, { search: async () => [] });
    expect(result.sources).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === "NO_PUBLIC_INTERVIEW_SOURCES")).toBe(true);
  });

  it("turns provider failures into recoverable warnings", async () => {
    const result = await researchInterview({ companyName: "Acme", companyUrl: "https://acme.example", mode: "production" }, { search: async () => { throw new Error("RATE_LIMITED"); } });
    expect(result.sources).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === "RATE_LIMITED")).toBe(true);
  });
});
