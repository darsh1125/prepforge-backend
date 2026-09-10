import { z } from "zod";

export const REQUIREMENT_KINDS = ["technical", "behavioural", "domain"] as const;
export const REQUIREMENT_PRIORITIES = ["must", "nice"] as const;
export const QUESTION_CATEGORIES = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
] as const;

export const requirementKindSchema = z.enum(REQUIREMENT_KINDS);
export const requirementPrioritySchema = z.enum(REQUIREMENT_PRIORITIES);
export const questionCategorySchema = z.enum(QUESTION_CATEGORIES);

export const nonEmptyIdSchema = z.string().trim().min(1, "ID must not be blank");

export const difficultySchema = z
  .number({ invalid_type_error: "difficulty must be a number" })
  .int("difficulty must be an integer")
  .min(1, "difficulty must be between 1 and 3")
  .max(3, "difficulty must be between 1 and 3");

export const minutesSchema = z
  .number({ invalid_type_error: "minutes must be a number" })
  .int("minutes must be an integer")
  .min(0, "minutes must be >= 0");

export const daysAvailableSchema = z
  .number({ invalid_type_error: "days_available must be a number" })
  .int("days_available must be an integer")
  .min(1, "days must be between 1 and 60")
  .max(60, "days must be between 1 and 60");

export const inputDaysSchema = daysAvailableSchema;

export const sourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().min(0),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});

export const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const requirementSchema = z.object({
  id: nonEmptyIdSchema,
  text: z.string(),
  kind: requirementKindSchema,
  priority: requirementPrioritySchema,
});

export const roleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(requirementSchema),
});

export const questionSchema = z.object({
  id: nonEmptyIdSchema,
  requirement_ids: z.array(nonEmptyIdSchema).transform((ids) => [...new Set(ids)]),
  category: questionCategorySchema,
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: difficultySchema,
});

export const flashcardSchema = z.object({
  id: nonEmptyIdSchema,
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(nonEmptyIdSchema).transform((ids) => [...new Set(ids)]),
});

export const scheduleDaySchema = z.object({
  day: z.number().int(),
  focus: z.string(),
  question_ids: z.array(nonEmptyIdSchema),
  minutes: minutesSchema,
});

export const scheduleSchema = z.object({
  days_available: daysAvailableSchema,
  days: z.array(scheduleDaySchema),
});

export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().min(0),
});

export const interviewKitSchema = z.object({
  source: sourceSchema,
  company_brief: companyBriefSchema,
  role: roleSchema,
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: scheduleSchema,
  coverage: coverageSchema,
});

export type Source = z.infer<typeof sourceSchema>;
export type CompanyBrief = z.infer<typeof companyBriefSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type InterviewKit = z.infer<typeof interviewKitSchema>;
export type RequirementKind = z.infer<typeof requirementKindSchema>;
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;
export type QuestionCategory = z.infer<typeof questionCategorySchema>;
