import type { InterviewKit } from "../../schemas/kit.js";

export type ReferentialIssue = {
  path: string;
  message: string;
};

export function validateReferentialIntegrity(kit: InterviewKit): ReferentialIssue[] {
  const issues: ReferentialIssue[] = [];
  const requirementIds = new Set(kit.role.requirements.map((requirement) => requirement.id));
  const questionIds = new Set(kit.questions.map((question) => question.id));

  kit.questions.forEach((question, index) => {
    question.requirement_ids.forEach((requirementId, refIndex) => {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          path: `questions[${index}].requirement_ids[${refIndex}]`,
          message: `Question "${question.id}" references unknown requirement "${requirementId}"`,
        });
      }
    });
  });

  kit.flashcards.forEach((flashcard, index) => {
    flashcard.requirement_ids.forEach((requirementId, refIndex) => {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          path: `flashcards[${index}].requirement_ids[${refIndex}]`,
          message: `Flashcard "${flashcard.id}" references unknown requirement "${requirementId}"`,
        });
      }
    });
  });

  kit.schedule.days.forEach((day, index) => {
    day.question_ids.forEach((questionId, refIndex) => {
      if (!questionIds.has(questionId)) {
        issues.push({
          path: `schedule.days[${index}].question_ids[${refIndex}]`,
          message: `Schedule day ${day.day} references unknown question "${questionId}"`,
        });
      }
    });
  });

  return issues;
}
