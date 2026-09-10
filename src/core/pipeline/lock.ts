import type { GenerationStatus } from "../status/generation.js";

export const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = ["queued", "crawling_company", "researching_interview", "extracting_requirements", "generating_questions", "checking_coverage", "filling_gaps", "generating_flashcards", "building_schedule", "validating"];

export function isActiveGeneration(status: string): boolean { return ACTIVE_GENERATION_STATUSES.includes(status as GenerationStatus); }

export function isStaleGeneration(updatedAt: string | undefined, now: string, staleMinutes: number): boolean {
  if (!updatedAt) return true;
  return new Date(now).getTime() - new Date(updatedAt).getTime() >= staleMinutes * 60_000;
}
