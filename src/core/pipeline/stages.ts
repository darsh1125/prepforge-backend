export const PIPELINE_STAGES = [
  "extract_requirements",
  "fetch_homepage",
  "discover_links",
  "rank_links",
  "retrieve_pages",
  "research_interview_process",
  "generate_questions",
  "calculate_coverage",
  "fill_coverage_gaps",
  "recheck_coverage",
  "generate_flashcards",
  "allocate_schedule",
  "validate_kit",
  "persist",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
