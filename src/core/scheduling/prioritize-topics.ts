import type { Question, Requirement } from "../../schemas/kit.js";

export function scoreQuestion(question: Question, requirements: Requirement[]): number {
  const linked = requirements.filter((requirement) => question.requirement_ids.includes(requirement.id));
  const priority = linked.reduce((sum, requirement) => sum + (requirement.priority === "must" ? 10 : 4), 0);
  const difficulty = question.difficulty === 3 ? 6 : question.difficulty === 2 ? 3 : 1;
  const category = question.category === "system-design" ? 2 : question.category === "technical" ? 1 : 0;
  return priority + difficulty + category + Math.max(0, linked.filter((requirement) => requirement.priority === "must").length - 1) * 2;
}

export function prioritizeQuestions(questions: Question[], requirements: Requirement[]): Question[] {
  return [...questions].sort((left, right) => scoreQuestion(right, requirements) - scoreQuestion(left, requirements) || left.id.localeCompare(right.id));
}
