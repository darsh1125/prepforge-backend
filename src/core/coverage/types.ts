import type { Question, Requirement } from "../../schemas/kit.js";

export type CoverageMap = Record<string, string[]>;
export type CoverageResult = { coveredRequirementIds: string[]; uncoveredRequirementIds: string[]; uncoveredMustRequirementIds: string[]; uncoveredNiceRequirementIds: string[]; coverageMap: CoverageMap; coverageRatio: number };
export type CoverageOutput = { uncovered_requirement_ids: string[]; passes: number };
export type CoverageStatus = "FULL_SUCCESS" | "PARTIAL_SUCCESS" | "FAILURE";
export type CoverageDiagnostic = { requirementId: string; priority: "must" | "nice"; coveredBy: string[] };
export type CoverageInput = { requirements: Requirement[]; questions: Question[] };
