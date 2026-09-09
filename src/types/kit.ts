/**
 * Domain types for the strict evaluator kit.
 * Authoritative Zod schemas live in src/schemas/kit.ts.
 * Types are inferred from those schemas to avoid drift.
 */
export type {
  CompanyBrief,
  Coverage,
  Flashcard,
  InterviewKit,
  Question,
  QuestionCategory,
  Requirement,
  RequirementKind,
  RequirementPriority,
  Role,
  Schedule,
  ScheduleDay,
  Source,
} from "../schemas/kit.js";
