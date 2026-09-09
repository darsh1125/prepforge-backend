import { describe, expect, it } from "vitest";
import type { InterviewKit } from "../src/schemas/kit.js";
import {
  inputDaysSchema,
  interviewKitSchema,
} from "../src/schemas/kit.js";
import { validateInterviewKit } from "../src/core/validation/kit.js";
import { validateReferentialIntegrity } from "../src/core/validation/referentialIntegrity.js";

function validKit(overrides: Partial<InterviewKit> = {}): InterviewKit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.example",
      role: "Frontend Engineer",
      location: "Remote",
      jd_chars: 42,
      researched_at: "2026-09-09T00:00:00.000Z",
      pages_used: ["https://acme.example"],
    },
    company_brief: {
      summary: "Acme builds developer tools.",
      what_they_do: "Interview preparation software",
      sources: ["https://acme.example"],
    },
    role: {
      title: "Frontend Engineer",
      seniority: "mid",
      responsibilities: ["Build UI"],
      requirements: [
        {
          id: "r1",
          text: "5+ years with React",
          kind: "technical",
          priority: "must",
        },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "How do you structure a React app?",
        answer_outline: "Discuss components, state, and data flow.",
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: "f1",
        front: "What is React?",
        back: "A UI library",
        requirement_ids: ["r1"],
      },
    ],
    schedule: {
      days_available: 5,
      days: [
        {
          day: 1,
          focus: "React fundamentals",
          question_ids: ["q1"],
          minutes: 60,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 2,
    },
    ...overrides,
  };
}

describe("Appendix A interview kit schema", () => {
  it("accepts a valid Appendix A kit", () => {
    const parsed = interviewKitSchema.safeParse(validKit());
    expect(parsed.success).toBe(true);
    const validation = validateInterviewKit(validKit());
    expect(validation.ok).toBe(true);
  });

  it("rejects difficulty 0", () => {
    const kit = validKit();
    kit.questions[0]!.difficulty = 0;
    const parsed = interviewKitSchema.safeParse(kit);
    expect(parsed.success).toBe(false);
  });

  it("rejects difficulty 4", () => {
    const kit = validKit();
    kit.questions[0]!.difficulty = 4;
    const parsed = interviewKitSchema.safeParse(kit);
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer difficulty", () => {
    const kit = validKit();
    kit.questions[0]!.difficulty = 1.5;
    const parsed = interviewKitSchema.safeParse(kit);
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid requirement kind", () => {
    const kit = validKit();
    const requirement = kit.role.requirements[0]!;
    const parsed = interviewKitSchema.safeParse({
      ...kit,
      role: {
        ...kit.role,
        requirements: [{ ...requirement, kind: "soft-skill" }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid requirement priority", () => {
    const kit = validKit();
    const requirement = kit.role.requirements[0]!;
    const parsed = interviewKitSchema.safeParse({
      ...kit,
      role: {
        ...kit.role,
        requirements: [{ ...requirement, priority: "optional" }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid question category", () => {
    const kit = validKit();
    const parsed = interviewKitSchema.safeParse({
      ...kit,
      questions: [{ ...kit.questions[0]!, category: "trivia" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer schedule minutes", () => {
    const kit = validKit();
    const parsed = interviewKitSchema.safeParse({
      ...kit,
      schedule: {
        ...kit.schedule,
        days: [{ ...kit.schedule.days[0]!, minutes: 45.5 }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a blank requirement id", () => {
    const kit = validKit();
    const requirement = kit.role.requirements[0]!;
    const parsed = interviewKitSchema.safeParse({
      ...kit,
      role: {
        ...kit.role,
        requirements: [{ ...requirement, id: "   " }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a blank question id", () => {
    const kit = validKit();
    const parsed = interviewKitSchema.safeParse({
      ...kit,
      questions: [{ ...kit.questions[0]!, id: "" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("referential integrity", () => {
  it("accepts valid requirement references", () => {
    const issues = validateReferentialIntegrity(validKit());
    expect(issues).toEqual([]);
  });

  it("detects a nonexistent question requirement id", () => {
    const kit = validKit();
    kit.questions[0]!.requirement_ids = ["r999"];
    const issues = validateReferentialIntegrity(kit);
    expect(issues.some((issue) => issue.path.startsWith("questions[0].requirement_ids"))).toBe(
      true,
    );
    expect(validateInterviewKit(kit).ok).toBe(false);
  });

  it("detects a nonexistent flashcard requirement id", () => {
    const kit = validKit();
    kit.flashcards[0]!.requirement_ids = ["r999"];
    const issues = validateReferentialIntegrity(kit);
    expect(issues.some((issue) => issue.path.startsWith("flashcards[0].requirement_ids"))).toBe(
      true,
    );
  });

  it("detects a nonexistent schedule question id", () => {
    const kit = validKit();
    kit.schedule.days[0]!.question_ids = ["q999"];
    const issues = validateReferentialIntegrity(kit);
    expect(issues.some((issue) => issue.path.startsWith("schedule.days[0].question_ids"))).toBe(
      true,
    );
  });
});

describe("schedule day range", () => {
  it("accepts days=1", () => {
    expect(inputDaysSchema.safeParse(1).success).toBe(true);
    const kit = validKit();
    kit.schedule.days_available = 1;
    expect(interviewKitSchema.safeParse(kit).success).toBe(true);
  });

  it("accepts days=60", () => {
    expect(inputDaysSchema.safeParse(60).success).toBe(true);
    const kit = validKit();
    kit.schedule.days_available = 60;
    expect(interviewKitSchema.safeParse(kit).success).toBe(true);
  });

  it("rejects days=0", () => {
    expect(inputDaysSchema.safeParse(0).success).toBe(false);
    const kit = validKit();
    kit.schedule.days_available = 0;
    expect(interviewKitSchema.safeParse(kit).success).toBe(false);
  });

  it("rejects days=61", () => {
    expect(inputDaysSchema.safeParse(61).success).toBe(false);
    const kit = validKit();
    kit.schedule.days_available = 61;
    expect(interviewKitSchema.safeParse(kit).success).toBe(false);
  });
});
