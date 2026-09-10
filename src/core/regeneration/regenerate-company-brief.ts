import { buildCompanyBrief } from "../pipeline/external-kit.js";
import type { CompanyBriefRegenerationInput } from "./types.js";

export function regenerateCompanyBrief(input: CompanyBriefRegenerationInput) {
  const generated = input.companyResearch ? buildCompanyBrief(input.companyResearch, input.interviewResearch ?? { sources: [] } as never) : { summary: "PrepForge could not retrieve enough public company information to produce a reliable summary.", what_they_do: "Insufficient public information was available from the provided sources.", sources: [] };
  return { summary: input.metadata.summaryEdited ? input.current.summary : generated.summary, what_they_do: input.metadata.whatTheyDoEdited ? input.current.what_they_do : generated.what_they_do, sources: generated.sources };
}
