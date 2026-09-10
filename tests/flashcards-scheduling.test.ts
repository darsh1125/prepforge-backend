import { describe, expect, it } from "vitest";
import { generateFlashcards, normalizeFlashcards } from "../src/core/generation/flashcards/index.js";
import type { LLMClient } from "../src/core/llm/client.js";
import { buildStudySchedule } from "../src/core/scheduling/index.js";
import type { Question, Requirement, Role } from "../src/schemas/kit.js";

const requirements: Requirement[] = [
  { id: "r1", text: "React", kind: "technical", priority: "must" },
  { id: "r2", text: "Stakeholder communication", kind: "behavioural", priority: "must" },
  { id: "r3", text: "GraphQL", kind: "technical", priority: "nice" },
];
const role: Role = { title: "Frontend Engineer", seniority: "mid", responsibilities: [], requirements };
const question = (id: string, requirement_ids: string[], difficulty: 1 | 2 | 3, category: Question["category"] = "technical"): Question => ({ id, requirement_ids, category, prompt: `${id} prompt`, answer_outline: "Discuss the context and trade-offs.", difficulty });
const questions = [question("q1", ["r1"], 3), question("q2", ["r2"], 2), question("q3", ["r3"], 1)];

describe("flashcard generation", () => {
  it("normalizes valid cards, deduplicates them, and assigns contiguous IDs", async () => {
    const client: LLMClient = { generateStructured: async <T>() => ({ flashcards: [{ front: "React renders", back: "State and props drive rendering.", requirement_ids: ["r1"] }, { front: " React renders! ", back: "State and props drive rendering.", requirement_ids: ["r1"] }] } as T) };
    const result = await generateFlashcards({ role, requirements, questions }, client);
    expect(result.flashcards.map((card) => card.id)).toEqual(["f1"]);
    expect(result.metadata[0]).toMatchObject({ origin: "generated", edited: false, pinned: false });
  });

  it("rejects invalid references and repairs malformed JSON", async () => {
    let calls = 0;
    const client: LLMClient = { generateStructured: async <T>() => { calls += 1; if (calls === 1) throw new Error("LLM_INVALID_RESPONSE"); return { flashcards: [{ front: "React cue", back: "Use the supplied React requirement.", requirement_ids: ["r1"] }] } as T; } };
    const result = await generateFlashcards({ role, requirements, questions }, client);
    expect(result.flashcards[0]?.id).toBe("f1");
    expect(() => normalizeFlashcards({ flashcards: [{ front: "Bad", back: "Ref", requirement_ids: ["r99"] }] }, requirements)).toThrow("FLASHCARD_REQUIREMENT_REFERENCE_INVALID");
  });

  it("stays empty for zero requirements", async () => {
    const client: LLMClient = { generateStructured: async <T>() => ({ flashcards: [{ front: "Invented", back: "No.", requirement_ids: [] }] } as T) };
    const result = await generateFlashcards({ role: { ...role, requirements: [] }, requirements: [], questions: [] }, client);
    expect(result.flashcards).toEqual([]);
  });
});

describe("deterministic study scheduling", () => {
  it("creates one exact day with integer minutes and all must coverage", () => {
    const result = buildStudySchedule({ daysAvailable: 1, role, requirements, questions });
    expect(result.schedule.days).toHaveLength(1);
    expect(result.schedule.days[0]?.day).toBe(1);
    expect(Number.isInteger(result.schedule.days[0]?.minutes)).toBe(true);
    expect(result.schedule.days[0]?.question_ids).toEqual(["q1", "q2", "q3"]);
  });

  it("creates exactly 60 deterministic review days", () => {
    const input = { daysAvailable: 60, role, requirements, questions };
    const first = buildStudySchedule(input).schedule;
    const second = buildStudySchedule(input).schedule;
    expect(first).toEqual(second);
    expect(first.days).toHaveLength(60);
    expect(first.days.map((day) => day.day)).toEqual(Array.from({ length: 60 }, (_, index) => index + 1));
    expect(first.days.every((day) => Number.isInteger(day.minutes) && day.question_ids.every((id) => ["q1", "q2", "q3"].includes(id)))).toBe(true);
  });

  it("puts harder must material before easy nice material and rejects broken inputs", () => {
    const result = buildStudySchedule({ daysAvailable: 3, role, requirements, questions });
    expect(result.schedule.days[0]?.question_ids[0]).toBe("q1");
    expect(() => buildStudySchedule({ daysAvailable: 3, role, requirements: [requirements[0]!], questions: [question("q1", ["r1"], 2)], coverageMap: { r1: ["q999"] } })).toThrow("SCHEDULE_COVERAGE_QUESTION_INVALID");
    expect(() => buildStudySchedule({ daysAvailable: 3, role, requirements, questions: [] })).toThrow("SCHEDULE_MUST_REQUIREMENT_UNCOVERED");
    expect(() => buildStudySchedule({ daysAvailable: 0, role, requirements, questions })).toThrow();
  });
});
