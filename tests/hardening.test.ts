import { describe, expect, it } from "vitest";
import { inspectUrlPolicy, inspectResolvedUrlPolicy } from "../src/core/retrieval/urlPolicy.js";
import { validateFinalInterviewKit } from "../src/core/validation/kit.js";

describe("security and final invariants", () => {
  it("blocks private production targets but allows evaluator localhost", async () => {
    expect(inspectUrlPolicy("http://127.0.0.1:8099/", "production").some((issue) => issue.code === "PRIVATE_ADDRESS_BLOCKED")).toBe(true);
    expect(inspectUrlPolicy("http://localhost:8099/", "production").some((issue) => issue.code === "PRIVATE_ADDRESS_BLOCKED")).toBe(true);
    expect(inspectUrlPolicy("http://localhost:8099/", "evaluator")).toEqual([]);
    expect(await inspectResolvedUrlPolicy("http://169.254.169.254/", "production")).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PRIVATE_ADDRESS_BLOCKED" })]));
  });

  it("rejects a final kit with invalid schedule references", () => {
    const result = validateFinalInterviewKit({ source: { company: "Acme", company_url: "https://acme.example", role: "Engineer", location: "Remote", jd_chars: 10, researched_at: "2026-01-01T00:00:00.000Z", pages_used: [] }, company_brief: { summary: "Acme", what_they_do: "Tools", sources: [] }, role: { title: "Engineer", seniority: "mid", responsibilities: [], requirements: [{ id: "r1", text: "Node.js", kind: "technical", priority: "must" }] }, questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Describe Node.js.", answer_outline: "Discuss experience.", difficulty: 2 }], flashcards: [], schedule: { days_available: 1, days: [{ day: 1, focus: "Review", question_ids: ["q999"], minutes: 30 }] }, coverage: { uncovered_requirement_ids: [], passes: 1 } });
    expect(result.ok).toBe(false);
  });
});
