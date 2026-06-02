/** Column lists that work on older Supabase projects (before optional migrations). */

export const ASSIGNMENT_SELECT_CORE =
  "id, class_id, title, description, due_date, created_at, questions";

export const ASSIGNMENT_SELECT_FULL =
  `${ASSIGNMENT_SELECT_CORE}, resource_url, allow_late`;

export const SUBMISSION_SELECT_CORE =
  "id, assignment_id, class_id, student_id, answer, answers, auto_score, auto_max_score, submitted_at, grade, feedback, graded_at";

export const SUBMISSION_SELECT_FULL = `${SUBMISSION_SELECT_CORE}, returned_for_revision`;
