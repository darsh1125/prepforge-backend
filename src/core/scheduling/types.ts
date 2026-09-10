import type { CoverageMap } from "../coverage/types.js";
import type { Question, Requirement, Schedule, Role } from "../../schemas/kit.js";

export type ScheduleInput = { daysAvailable: number; role: Role; requirements: Requirement[]; questions: Question[]; coverageMap?: CoverageMap };
export type ScheduleDiagnostic = { questionScores: Record<string, number>; totalMinutes: number };
export type ScheduleResult = { schedule: Schedule; diagnostics: ScheduleDiagnostic };
