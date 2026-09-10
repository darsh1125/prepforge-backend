import { questionSchema, type Question, type Requirement } from "../../schemas/kit.js";
import type { CoverageMap, CoverageResult } from "./types.js";

export function validateQuestionReferences(requirements: Requirement[], questions: Question[]): void {
  const ids = new Set(requirements.map((requirement) => requirement.id));
  for (const question of questions) {
    questionSchema.parse(question);
    const invalid = question.requirement_ids.filter((id) => !ids.has(id));
    if (invalid.length > 0) throw new Error(`QUESTION_REQUIREMENT_REFERENCE_INVALID:${invalid.join(",")}`);
  }
}

export function buildCoverageMap(requirements: Requirement[], questions: Question[]): CoverageMap {
  const map: CoverageMap = Object.fromEntries(requirements.map((requirement) => [requirement.id, []]));
  for (const question of questions) for (const requirementId of new Set(question.requirement_ids)) if (map[requirementId]) map[requirementId].push(question.id);
  return map;
}

export function checkCoverage(requirements: Requirement[], questions: Question[]): CoverageResult {
  validateQuestionReferences(requirements, questions);
  const coverageMap = buildCoverageMap(requirements, questions);
  const coveredRequirementIds = requirements.filter((requirement) => coverageMap[requirement.id]?.length).map((requirement) => requirement.id);
  const uncovered = requirements.filter((requirement) => !coverageMap[requirement.id]?.length);
  return { coveredRequirementIds, uncoveredRequirementIds: uncovered.map((requirement) => requirement.id), uncoveredMustRequirementIds: uncovered.filter((requirement) => requirement.priority === "must").map((requirement) => requirement.id), uncoveredNiceRequirementIds: uncovered.filter((requirement) => requirement.priority === "nice").map((requirement) => requirement.id), coverageMap, coverageRatio: requirements.length === 0 ? 1 : coveredRequirementIds.length / requirements.length };
}
