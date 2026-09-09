export const GENERATION_STATUSES = [
  "queued",
  "extracting_requirements",
  "crawling_company",
  "researching_interview",
  "generating_questions",
  "checking_coverage",
  "filling_gaps",
  "generating_flashcards",
  "building_schedule",
  "validating",
  "completed",
  "completed_with_warnings",
  "failed",
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export type GenerationProgress = {
  stage: GenerationStatus;
  percent: number;
  message: string;
};

export const FATAL_STATUSES: readonly GenerationStatus[] = ["failed"];

export const SUCCESS_STATUSES: readonly GenerationStatus[] = [
  "completed",
  "completed_with_warnings",
];
