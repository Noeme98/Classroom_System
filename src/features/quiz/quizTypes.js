/** @typedef {'mcq' | 'true_false' | 'identification' | 'multi_select' | 'essay'} QuizQuestionType */

export const QUIZ_SCHEMA_VERSION = 1;

export function getQuizItems(assignment) {
  const raw = assignment?.questions;
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "object" && Array.isArray(raw.items)) return raw.items.filter(Boolean);
  return [];
}

export function packQuizEnvelope(items) {
  const list = (items || []).filter((q) => q && String(q.prompt || "").trim());
  if (list.length === 0) return null;
  return { schemaVersion: QUIZ_SCHEMA_VERSION, items: list };
}

export function newQuestionId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
