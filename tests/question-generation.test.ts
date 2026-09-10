import { describe, expect, it } from "vitest";
import { generateAllQuestions, generateCategoryQuestions } from "../src/core/generation/questions/index.js";
import type { LLMClient } from "../src/core/llm/client.js";
import type { QuestionGenerationContext } from "../src/core/generation/questions/types.js";

const context: QuestionGenerationContext = {
  role: { title: "Senior Backend Engineer", seniority: "Senior", responsibilities: ["Mentor junior engineers"], requirements: [
    { id: "r1", text: "React experience", kind: "technical", priority: "must" },
    { id: "r2", text: "Mentor junior engineers", kind: "behavioural", priority: "must" },
    { id: "r3", text: "Distributed systems", kind: "technical", priority: "nice" },
  ] },
  requirements: [
    { id: "r1", text: "React experience", kind: "technical", priority: "must" },
    { id: "r2", text: "Mentor junior engineers", kind: "behavioural", priority: "must" },
    { id: "r3", text: "Distributed systems", kind: "technical", priority: "nice" },
  ],
  interviewResearch: { companyIdentifier: "Acme", queries: [], sources: [{ sourceId: "s1", title: "Acme interview experience", url: "https://example.com/acme", domain: "example.com", snippet: "", sourceType: "interview-review", authority: "first-person-public", cleanedText: "Candidate reports mention a coding round.", fetchedAt: "2026-01-01", relevanceScore: 10 }], warnings: [], metadata: { startedAt: "", completedAt: "", sourceCount: 1, successfulFetches: 1, failedFetches: 0 } },
};

function fakeClient(response: unknown): LLMClient { return { generateStructured: async <T>() => response as T }; }

describe("question generation", () => {
  it("generates technical questions with valid requirement references", async () => {
    const result = await generateCategoryQuestions("technical", context, fakeClient({ questions: [{ requirement_ids: ["r1"], prompt: "How would you diagnose a slow React render?", answer_outline: "Discuss profiling, render boundaries, state locality, and measuring before and after.", difficulty: 2 }] }));
    expect(result.questions[0]).toMatchObject({ category: "technical", requirement_ids: ["r1"], difficulty: 2 });
  });

  it("repairs invalid requirement references and difficulty through a bounded second response", async () => {
    let attempts = 0;
    const client: LLMClient = { generateStructured: async <T>() => { attempts += 1; return (attempts === 1 ? { questions: [{ requirement_ids: ["r99"], prompt: "bad", answer_outline: "bad", difficulty: 4 }] } : { questions: [{ requirement_ids: ["r1"], prompt: "Explain React rendering.", answer_outline: "Discuss component updates and measurement.", difficulty: 1 }] }) as T; } };
    const result = await generateCategoryQuestions("technical", context, client);
    expect(attempts).toBe(2);
    expect(result.questions[0]?.requirement_ids).toEqual(["r1"]);
  });

  it("skips system design without architecture evidence", async () => {
    const thin = { ...context, role: { ...context.role, title: "Frontend Engineer", seniority: "", requirements: [{ id: "r1", text: "React experience", kind: "technical" as const, priority: "must" as const }] }, requirements: [{ id: "r1", text: "React experience", kind: "technical" as const, priority: "must" as const }] };
    const result = await generateCategoryQuestions("system-design", thin, fakeClient({ questions: [] }));
    expect(result.questions).toEqual([]);
    expect(result.warnings[0]?.code).toBe("NO_SYSTEM_DESIGN_SIGNAL");
  });

  it("keeps category ordering and partial failures", async () => {
    let attempts = 0;
    const result = await generateAllQuestions(context, { generateStructured: async <T>() => { attempts += 1; if (attempts === 1) return { questions: [{ requirement_ids: ["r1"], prompt: "Technical question", answer_outline: "Technical outline", difficulty: 1 }] } as T; throw new Error("LLM_UNAVAILABLE"); } });
    expect(result.questions[0]?.id).toBe("q1");
    expect(result.questions[0]?.category).toBe("technical");
    expect(result.warnings.some((warning) => warning.code === "LLM_UNAVAILABLE")).toBe(true);
  });
});
