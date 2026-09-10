import type { RequirementKind, RequirementPriority } from "../../schemas/kit.js";

export type ExtractedRequirement = { text: string; kind: RequirementKind; priority: RequirementPriority };
export type ExtractedRole = { title: string; seniority: string; location: string; responsibilities: string[]; requirements: ExtractedRequirement[] };
export type NormalizedRole = Omit<ExtractedRole, "requirements"> & { requirements: (ExtractedRequirement & { id: string })[] };
export type ExtractionWarning = { code: string; message: string; recoverable: boolean };
export type JDExtractionResult = { role: NormalizedRole; warnings: ExtractionWarning[]; metadata: { provider: string; model: string; attempts: number; extractedAt: string; jdChars: number } };
