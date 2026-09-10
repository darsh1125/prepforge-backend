import { type Question, type Schedule } from "../../schemas/kit.js";
import { allocateMinutes, totalStudyMinutes } from "./allocate-minutes.js";
import { prioritizeQuestions, scoreQuestion } from "./prioritize-topics.js";
import { validateSchedule, validateScheduleInput } from "./validation.js";
import type { ScheduleInput, ScheduleResult } from "./types.js";

function focusFor(questions: Question[]): string {
  if (questions.length === 0) return "Light review and preparation";
  const counts = new Map<string, number>();
  for (const question of questions) counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
  const category = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  if (category === "system-design") return "System design practice";
  if (category === "technical") return "Technical requirements practice";
  if (category === "behavioural") return "Behavioural interview practice";
  if (category === "company-fit") return "Company-fit interview practice";
  return "Mixed interview review";
}

function buildQuestionDays(days: number, questions: Question[]): Question[][] {
  if (questions.length === 0) return Array.from({ length: days }, () => []);
  const buckets = Array.from({ length: days }, () => [] as Question[]);
  if (questions.length >= days) questions.forEach((question, index) => buckets[Math.floor(index * days / questions.length)]!.push(question));
  else questions.forEach((question, index) => buckets[index]!.push(question));
  for (let day = questions.length; day < days; day += 1) buckets[day]!.push(questions[day % questions.length]!);
  return buckets;
}

export function buildStudySchedule(input: ScheduleInput): ScheduleResult {
  validateScheduleInput(input.daysAvailable, input.requirements, input.questions, input.coverageMap);
  const prioritized = prioritizeQuestions(input.questions, input.requirements);
  const workload = prioritized.reduce((sum, question) => sum + scoreQuestion(question, input.requirements), 0);
  const totalMinutes = totalStudyMinutes(input.daysAvailable, prioritized.length, workload);
  const minutes = allocateMinutes(input.daysAvailable, totalMinutes);
  const questionDays = buildQuestionDays(input.daysAvailable, prioritized);
  const schedule: Schedule = { days_available: input.daysAvailable, days: questionDays.map((dayQuestions, index) => ({ day: index + 1, focus: focusFor(dayQuestions), question_ids: dayQuestions.map((question) => question.id), minutes: minutes[index]! })) };
  return { schedule: validateSchedule(schedule, input.requirements, input.questions), diagnostics: { questionScores: Object.fromEntries(prioritized.map((question) => [question.id, scoreQuestion(question, input.requirements)])), totalMinutes } };
}

export type { ScheduleInput, ScheduleResult } from "./types.js";
