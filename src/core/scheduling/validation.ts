import { daysAvailableSchema, scheduleSchema, type Question, type Requirement, type Schedule } from "../../schemas/kit.js";

export function validateScheduleInput(daysAvailable: number, requirements: Requirement[], questions: Question[], coverageMap?: Record<string, string[]>): void {
  daysAvailableSchema.parse(daysAvailable);
  const questionIds = new Set(questions.map((question) => question.id));
  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  for (const question of questions) {
    const invalid = question.requirement_ids.filter((id) => !requirementIds.has(id));
    if (invalid.length > 0) throw new Error(`SCHEDULE_REQUIREMENT_REFERENCE_INVALID:${invalid.join(",")}`);
  }
  const missingMust = requirements.filter((requirement) => requirement.priority === "must" && !questions.some((question) => question.requirement_ids.includes(requirement.id))).map((requirement) => requirement.id);
  if (missingMust.length > 0) throw new Error(`SCHEDULE_MUST_REQUIREMENT_UNCOVERED:${missingMust.join(",")}`);
  if (questions.some((question) => !questionIds.has(question.id))) throw new Error("SCHEDULE_QUESTION_REFERENCE_INVALID");
  if (coverageMap) {
    for (const [requirementId, referencedQuestions] of Object.entries(coverageMap)) {
      if (!requirementIds.has(requirementId)) throw new Error(`SCHEDULE_COVERAGE_REQUIREMENT_INVALID:${requirementId}`);
      if (referencedQuestions.some((questionId) => !questionIds.has(questionId))) throw new Error(`SCHEDULE_COVERAGE_QUESTION_INVALID:${requirementId}`);
    }
  }
}

export function validateSchedule(schedule: Schedule, requirements: Requirement[], questions: Question[]): Schedule {
  scheduleSchema.parse(schedule);
  if (schedule.days.length !== schedule.days_available || schedule.days.some((day, index) => day.day !== index + 1)) throw new Error("SCHEDULE_DAY_COUNT_INVALID");
  const questionIds = new Set(questions.map((question) => question.id));
  for (const day of schedule.days) for (const questionId of day.question_ids) if (!questionIds.has(questionId)) throw new Error(`SCHEDULE_QUESTION_REFERENCE_INVALID:${questionId}`);
  const mustIds = requirements.filter((requirement) => requirement.priority === "must").map((requirement) => requirement.id);
  const scheduledIds = new Set(schedule.days.flatMap((day) => day.question_ids));
  const covered = mustIds.filter((requirementId) => questions.some((question) => scheduledIds.has(question.id) && question.requirement_ids.includes(requirementId)));
  if (covered.length !== mustIds.length) throw new Error(`SCHEDULE_MUST_REQUIREMENT_UNCOVERED:${mustIds.filter((id) => !covered.includes(id)).join(",")}`);
  return schedule;
}
