import { describe, expect, it } from "vitest";
import { regenerateCompanyBrief, regenerateQuestionCategory, regenerateSchedule, partitionQuestions } from "../src/core/regeneration/index.js";
import type { LLMClient } from "../src/core/llm/client.js";
import type { Role, Question } from "../src/schemas/kit.js";

const role: Role = { title: "Platform Engineer", seniority: "mid", responsibilities: ["Build services"], requirements: [
  { id: "r1", text: "React", kind: "technical", priority: "must" },
  { id: "r2", text: "Distributed systems", kind: "technical", priority: "must" },
] };
const question = (id: string, prompt: string, requirement_ids: string[] = ["r1"]): Question => ({ id, prompt, answer_outline: "Discuss trade-offs.", difficulty: 2, category: "technical", requirement_ids });
const metadata = [
  { id: "q1", internalId: "stable-q1", origin: "generated" as const, edited: false, pinned: false, order: 0 },
  { id: "q2", internalId: "stable-q2", origin: "generated" as const, edited: true, pinned: false, order: 1 },
  { id: "q3", internalId: "stable-q3", origin: "generated" as const, edited: false, pinned: true, order: 2 },
  { id: "q4", internalId: "stable-q4", origin: "user" as const, edited: false, pinned: false, order: 3 },
];

describe("section regeneration preservation", () => {
  it("partitions untouched generated questions from edited, pinned, and user content", () => {
    const result = partitionQuestions([question("q1", "Replace me"), question("q2", "Edited"), question("q3", "Pinned"), question("q4", "Mine")], metadata, "technical");
    expect(result.replaceable.map((item) => item.id)).toEqual(["q1"]);
    expect(result.preserved.map((item) => item.id)).toEqual(["q2", "q3", "q4"]);
  });

  it("replaces only untouched generated questions, preserves IDs, and appends new IDs", async () => {
    const client: LLMClient = { generateStructured: async <T>() => ({ questions: [{ requirement_ids: ["r2"], prompt: "New distributed systems question", answer_outline: "Discuss partitioning.", difficulty: 2 }] } as T) };
    const result = await regenerateQuestionCategory({ category: "technical", role, requirements: role.requirements, questions: [question("q1", "Replace me"), question("q2", "Edited"), question("q3", "Pinned"), question("q4", "Mine")], metadata }, client);
    expect(result.questions.map((item) => item.id)).toEqual(["q2", "q3", "q4", "q5"]);
    expect(result.questions.find((item) => item.id === "q2")?.prompt).toBe("Edited");
    expect(result.metadata.find((item) => item.id === "q5")).toMatchObject({ origin: "generated", edited: false, pinned: false });
    expect(result.replacedCount).toBe(1);
  });

  it("discards generated duplicates instead of removing preserved content", async () => {
    const client: LLMClient = { generateStructured: async <T>() => ({ questions: [{ requirement_ids: ["r2"], prompt: "Edited", answer_outline: "Duplicate", difficulty: 2 }] } as T) };
    const result = await regenerateQuestionCategory({ category: "technical", role, requirements: role.requirements, questions: [question("q1", "Replace me"), question("q2", "Edited")], metadata: metadata.slice(0, 2) }, client);
    expect(result.questions.map((item) => item.id)).toEqual(["q2"]);
    expect(result.questions[0]?.prompt).toBe("Edited");
  });

  it("fails before persistence when the category provider cannot produce valid output", async () => {
    const client: LLMClient = { generateStructured: async <T>() => ({ invalid: true } as T) };
    await expect(regenerateQuestionCategory({ category: "technical", role, requirements: role.requirements, questions: [question("q1", "Replace me")], metadata: metadata.slice(0, 1) }, client)).rejects.toThrow("QUESTION_CATEGORY_GENERATION_FAILED");
  });

  it("preserves edited brief fields and updates sources from persisted evidence", () => {
    const result = regenerateCompanyBrief({ current: { summary: "User summary", what_they_do: "Old", sources: ["old"] }, metadata: { summaryEdited: true, whatTheyDoEdited: false }, companyResearch: { requestedUrl: "https://acme.example", pagesUsed: ["https://acme.example"], pages: [{ url: "https://acme.example", statusCode: 200, contentType: "text/html", title: "Acme", text: "Acme builds tools for teams.", links: [], fetchedAt: "now" }], warnings: [], metadata: { companyNameHint: "Acme" } }, interviewResearch: { sources: [], queries: [], warnings: [], metadata: { startedAt: "now", completedAt: "now", sourceCount: 0, successfulFetches: 0, failedFetches: 0 }, companyIdentifier: "acme" } });
    expect(result.summary).toBe("User summary");
    expect(result.what_they_do).toBe("Acme builds tools for teams.");
    expect(result.sources).toEqual(["https://acme.example"]);
  });

  it("rebuilds schedules deterministically without an LLM and rejects unresolved must gaps", () => {
    const input = { daysAvailable: 3, role, questions: [question("q1", "React"), question("q2", "Distributed", ["r2"])] };
    expect(regenerateSchedule(input)).toEqual(regenerateSchedule(input));
    expect(() => regenerateSchedule({ ...input, questions: [question("q1", "React")] })).toThrow("MUST_REQUIREMENT_COVERAGE_FAILED");
  });
});
