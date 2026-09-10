import { buildStudySchedule } from "../scheduling/build-schedule.js";
import { checkCoverage } from "../coverage/check-coverage.js";
import type { Question, Role, Schedule } from "../../schemas/kit.js";

export function regenerateSchedule(input: { daysAvailable: number; role: Role; questions: Question[] }): Schedule {
  const coverage = checkCoverage(input.role.requirements, input.questions);
  if (coverage.uncoveredMustRequirementIds.length) throw new Error(`MUST_REQUIREMENT_COVERAGE_FAILED:${coverage.uncoveredMustRequirementIds.join(",")}`);
  return buildStudySchedule({ daysAvailable: input.daysAvailable, role: input.role, requirements: input.role.requirements, questions: input.questions }).schedule;
}
