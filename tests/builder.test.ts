import { describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors/appError.js";
import {
  createMetadata,
  hasQuestionContentChanged,
  nextExportId,
  normalizeMetadata,
  sortByMetadata,
} from "../src/core/builder/state.js";
import {
  companyBriefUpdateSchema,
  flashcardCreateSchema,
  flashcardUpdateSchema,
  questionUpdateSchema,
  reorderSchema,
} from "../src/schemas/builder.js";
import { questionSchema } from "../src/schemas/kit.js";

const question = {
  id: "q1",
  requirement_ids: ["r1"],
  category: "technical" as const,
  prompt: "Explain state management.",
  answer_outline: "Compare local and shared state.",
  difficulty: 2,
};

const questionTwo = { ...question, id: "q2", prompt: "Explain caching." };

describe("kit builder identity and ordering", () => {
  it("preserves generated identity, marks meaningful edits, and detects no-op edits", () => {
    const metadata = normalizeMetadata([question], [{ internalKey: "technical-q1", internalId: "stable-q1", id: "q1", origin: "generated", edited: false, pinned: false, order: 0 }], "q");
    expect(metadata[0]).toMatchObject({ internalId: "stable-q1", id: "q1", edited: false });
    expect(hasQuestionContentChanged(question, { ...question })).toBe(false);
    expect(hasQuestionContentChanged(question, { ...question, difficulty: 3 })).toBe(true);
    expect(hasQuestionContentChanged(question, { ...question, category: "behavioural" })).toBe(true);
    expect(hasQuestionContentChanged(question, { ...question, requirement_ids: ["r2"] })).toBe(true);
  });

  it("allocates monotonic question and flashcard export IDs across deletions", () => {
    expect(nextExportId([question, questionTwo], ["q3"], "q")).toBe("q4");
    expect(nextExportId([{ ...question, id: "f2" }], ["f4"], "f")).toBe("f5");
    expect(createMetadata("q3", "q", "user", 2)).toMatchObject({ id: "q3", origin: "user", edited: true, pinned: false, order: 2 });
  });

  it("persists reorder order and supports invalid reorder rejection", () => {
    const metadata = normalizeMetadata([question, questionTwo], undefined, "q").map((entry, index) => ({ ...entry, order: index === 0 ? 1 : 0 }));
    expect(sortByMetadata([question, questionTwo], metadata).map((item) => item.id)).toEqual(["q2", "q1"]);
    expect(reorderSchema.safeParse({ question_ids: ["q1", "q2"], expectedRevision: 4 }).success).toBe(true);
    expect(reorderSchema.safeParse({ question_ids: ["q1", "q1"], expectedRevision: 4 }).success).toBe(false);
    expect(reorderSchema.safeParse({ question_ids: "q1", expectedRevision: 4 }).success).toBe(false);
  });
});

describe("kit builder request boundaries", () => {
  it("supports question edits and keeps internal fields out of Appendix A questions", () => {
    expect(questionUpdateSchema.safeParse({ prompt: "Updated", expectedRevision: 2 }).success).toBe(true);
    const parsed = questionSchema.parse({ ...question, internalId: "private", origin: "user", pinned: true });
    expect(parsed).not.toHaveProperty("internalId");
    expect(parsed).not.toHaveProperty("origin");
    expect(parsed).not.toHaveProperty("pinned");
  });

  it("covers flashcard create/update/delete payload shapes", () => {
    expect(flashcardCreateSchema.safeParse({ front: "Q", back: "A", requirement_ids: [], expectedRevision: 0 }).success).toBe(true);
    expect(flashcardUpdateSchema.safeParse({ back: "Updated A", expectedRevision: 1 }).success).toBe(true);
    expect(flashcardUpdateSchema.safeParse({ back: "", expectedRevision: 1 }).success).toBe(false);
  });

  it("allows company brief text but rejects source tampering", () => {
    expect(companyBriefUpdateSchema.safeParse({ summary: "New summary", expectedRevision: 3 }).success).toBe(true);
    expect(companyBriefUpdateSchema.safeParse({ sources: ["https://attacker.example"], expectedRevision: 3 }).success).toBe(false);
  });

  it("represents revision conflicts and ownership denial with stable API errors", () => {
    expect(new AppError("KIT_VERSION_CONFLICT", "Revision changed", 409).code).toBe("KIT_VERSION_CONFLICT");
    expect(new AppError("FORBIDDEN", "Kit is not owned by this user", 403).statusCode).toBe(403);
  });
});
