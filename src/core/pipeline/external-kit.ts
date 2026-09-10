import type { CompanyCrawlResult } from "../retrieval/types.js";
import type { InterviewResearchResult } from "../research/types.js";
import type { JDExtractionResult } from "../extraction/types.js";
import type { QuestionsWithCoverageResult } from "../coverage/generate-with-coverage.js";
import type { FlashcardGenerationResult } from "../generation/flashcards/types.js";
import type { ScheduleResult } from "../scheduling/types.js";
import type { InterviewKit, Role } from "../../schemas/kit.js";

function firstSentence(text: string): string {
  const sentence = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return sentence.slice(0, 500);
}

export function buildCompanyBrief(crawl: CompanyCrawlResult, interview: InterviewResearchResult): { summary: string; what_they_do: string; sources: string[] } {
  const page = crawl.pages.find((candidate) => candidate.text.trim());
  if (!page) return { summary: "PrepForge could not retrieve enough public company information to produce a reliable summary.", what_they_do: "Insufficient public information was available from the provided sources.", sources: [] };
  const summary = firstSentence(page.text) || "Public company information was retrieved from the provided website.";
  const sources = [...new Set([...crawl.pagesUsed, ...interview.sources.filter((source) => source.authority === "official").map((source) => source.url)])];
  return { summary, what_they_do: summary, sources };
}

export function buildExternalKit(input: { companyUrl: string; jd: string; researchedAt: string; crawl: CompanyCrawlResult; interview: InterviewResearchResult; extraction: JDExtractionResult; questions: QuestionsWithCoverageResult; flashcards: FlashcardGenerationResult; schedule: ScheduleResult }): InterviewKit {
  const role: Role = { title: input.extraction.role.title, seniority: input.extraction.role.seniority, responsibilities: input.extraction.role.responsibilities, requirements: input.extraction.role.requirements };
  return {
    source: { company: input.crawl.metadata.companyNameHint ?? new URL(input.companyUrl).hostname, company_url: input.companyUrl, role: role.title, location: input.extraction.role.location, jd_chars: input.jd.length, researched_at: input.researchedAt, pages_used: [...new Set(input.crawl.pagesUsed)] },
    company_brief: buildCompanyBrief(input.crawl, input.interview),
    role,
    questions: input.questions.questions,
    flashcards: input.flashcards.flashcards,
    schedule: input.schedule.schedule,
    coverage: input.questions.coverage,
  };
}
