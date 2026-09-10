import { describe, expect, it } from "vitest";
import { buildCoverageMap, checkCoverage, validateQuestionReferences } from "../src/core/coverage/check-coverage.js";
import { generateQuestionsWithCoverage } from "../src/core/coverage/generate-with-coverage.js";
import type { QuestionGenerationContext } from "../src/core/generation/questions/types.js";
import type { LLMClient } from "../src/core/llm/client.js";
import type { Requirement } from "../src/schemas/kit.js";

const requirements: Requirement[] = [
  { id: "r1", text: "React", kind: "technical" as const, priority: "must" as const },
  { id: "r2", text: "Communication", kind: "behavioural" as const, priority: "must" as const },
  { id: "r3", text: "GraphQL", kind: "technical" as const, priority: "nice" as const },
];
const question = (id: string, requirement_ids: string[], category: "technical" | "behavioural" = "technical") => ({ id, requirement_ids, category, prompt: `${id} prompt`, answer_outline: "Discuss the relevant context and trade-offs.", difficulty: 2 as const });

describe("deterministic coverage", () => {
  it("reports full coverage after the first pass", async () => {
    const context: QuestionGenerationContext = { role: { title: "Engineer", seniority: "", responsibilities: [], requirements: [requirements[0]!] }, requirements: [requirements[0]!] };
    const client: LLMClient = { generateStructured: async <T>() => ({ questions: [{ requirement_ids: ["r1"], prompt: "React question", answer_outline: "Discuss React.", difficulty: 1 }] } as T) };
    const result = await generateQuestionsWithCoverage(context, client);
    expect(result.coverage).toEqual({ uncovered_requirement_ids: [], passes: 1 });
    expect(result.status).toBe("FULL_SUCCESS");
  });

  it("covers multi-ID questions and separates must/nice gaps", () => {
    const result = checkCoverage(requirements, [question("q1", ["r1", "r1", "r2"])]);
    expect(result.coveredRequirementIds).toEqual(["r1", "r2"]);
    expect(result.uncoveredRequirementIds).toEqual(["r3"]);
    expect(result.uncoveredMustRequirementIds).toEqual([]);
    expect(result.uncoveredNiceRequirementIds).toEqual(["r3"]);
    expect(buildCoverageMap(requirements, [question("q1", ["r1", "r2"])]).r1).toEqual(["q1"]);
  });

  it("rejects invalid references and handles zero requirements", () => {
    expect(() => validateQuestionReferences(requirements, [question("q1", ["r99"])] )).toThrow("QUESTION_REQUIREMENT_REFERENCE_INVALID");
    expect(checkCoverage([], [question("q1", [])]).uncoveredRequirementIds).toEqual([]);
  });

  it("performs one targeted gap pass and reports two coverage passes", async () => {
    const context: QuestionGenerationContext = { role: { title: "Engineer", seniority: "", responsibilities: [], requirements }, requirements };
    let calls = 0;
    const client: LLMClient = { generateStructured: async <T>() => { calls += 1; if (calls === 1) return { questions: [{ requirement_ids: ["r1"], prompt: "React question", answer_outline: "Discuss React.", difficulty: 1 }] } as T; if (calls === 2) return { questions: [] } as T; if (calls === 3) return { questions: [{ requirement_ids: ["r2"], prompt: "Communication question", answer_outline: "Discuss the scenario and outcome.", difficulty: 2 }] } as T; return { questions: [{ requirement_ids: ["r3"], prompt: "GraphQL question", answer_outline: "Discuss the technical trade-offs.", difficulty: 2 }] } as T; } };
    const result = await generateQuestionsWithCoverage(context, client);
    expect(result.coverage.passes).toBe(2);
    expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    expect(result.questions.map((item) => item.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("deduplicates a gap question and uses the must-have fallback", async () => {
    const targetRequirements: Requirement[] = [requirements[0]!, { id: "r4", text: "TypeScript", kind: "technical", priority: "must" }];
    const context: QuestionGenerationContext = { role: { title: "Engineer", seniority: "", responsibilities: [], requirements: targetRequirements }, requirements: targetRequirements };
    let calls = 0;
    const client: LLMClient = { generateStructured: async <T>() => { calls += 1; return { questions: calls === 1 ? [{ requirement_ids: ["r1"], prompt: "React question", answer_outline: "Discuss React.", difficulty: 1 }] : [{ requirement_ids: ["r4"], prompt: "React question", answer_outline: "Discuss React.", difficulty: 1 }] } as T; } };
    const result = await generateQuestionsWithCoverage(context, client);
    expect(result.coverage).toEqual({ uncovered_requirement_ids: [], passes: 3 });
    expect(result.status).toBe("FULL_SUCCESS");
    expect(result.questions).toHaveLength(2);
    expect(result.questions.some((item) => item.requirement_ids.includes("r4") && item.prompt.includes("TypeScript"))).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "MUST_REQUIREMENT_FALLBACK_USED")).toBe(true);
  });
});
