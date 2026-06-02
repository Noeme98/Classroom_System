import { getQuizItems } from "./quizTypes";

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toStrArray(v) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (v == null || v === "") return [];
  return [String(v)];
}

/**
 * @param {unknown[]} items
 * @param {Record<string, unknown>} answers
 */
export function validateQuizAnswers(items, answers) {
  for (const q of items) {
    if (!q?.id) continue;
    const v = answers?.[q.id];
    if (q.type === "essay") {
      if (!String(v || "").trim()) {
        return { ok: false, message: "Please answer every question, including written responses." };
      }
      continue;
    }
    if (q.type === "multi_select") {
      if (!Array.isArray(v) || v.length === 0) {
        return { ok: false, message: "Select at least one option where required." };
      }
      continue;
    }
    if (q.type === "true_false") {
      if (v !== true && v !== false) {
        return { ok: false, message: "Please mark True or False for each statement." };
      }
      continue;
    }
    if (v == null || v === "") {
      return { ok: false, message: "Please answer every question before submitting." };
    }
  }
  return { ok: true };
}

/**
 * @param {unknown[]} items
 * @param {Record<string, unknown>} answers
 */
export function computeAutoGrade(items, answers) {
  let earned = 0;
  let max = 0;
  const details = [];
  let hasEssay = false;

  for (const q of items) {
    if (!q?.id) continue;
    const pts = Number(q.points) > 0 ? Number(q.points) : 1;
    const studentVal = answers?.[q.id];

    if (q.type === "essay") {
      hasEssay = true;
      details.push({
        id: q.id,
        type: "essay",
        correct: null,
        earned: 0,
        max: pts,
        pendingEssay: true,
      });
      continue;
    }

    max += pts;
    let ok;
    switch (q.type) {
      case "mcq":
        ok = String(studentVal || "") === String(q.correctOptionId || "");
        break;
      case "true_false":
        ok = studentVal === q.correctTrueFalse;
        break;
      case "identification": {
        const normalized = norm(studentVal);
        const rawList = Array.isArray(q.acceptableAnswers)
          ? q.acceptableAnswers
          : q.correctAnswer != null
            ? [q.correctAnswer]
            : [];
        const list = rawList.map((a) => norm(a)).filter(Boolean);
        ok = list.some((a) => a === normalized);
        break;
      }
      case "multi_select": {
        const want = [...new Set(toStrArray(q.correctOptionIds))].sort();
        const got = [...new Set(toStrArray(studentVal))].sort();
        ok = want.length > 0 && want.length === got.length && want.every((v, i) => v === got[i]);
        break;
      }
      default:
        max -= pts;
        details.push({
          id: q.id,
          type: q.type,
          correct: false,
          earned: 0,
          max: 0,
          note: "unsupported",
        });
        continue;
    }

    const points = ok ? pts : 0;
    earned += points;
    details.push({
      id: q.id,
      type: q.type,
      correct: ok,
      earned: points,
      max: pts,
    });
  }

  const grade100 = max > 0 ? Math.round((earned / max) * 100) : null;
  return { earned, max, details, grade100, hasEssay };
}

export function buildAutoFeedback(details, hasEssay) {
  const lines = details
    .filter((d) => !d.pendingEssay)
    .map((d) => {
      if (d.note === "unsupported") return `• ${d.id}: not auto-scored`;
      const mark = d.correct ? "✓" : "✗";
      return `• ${mark} ${d.id} (${d.earned}/${d.max} pts)`;
    });
  if (hasEssay) {
    lines.push("• Written response(s): teacher review for full credit.");
  }
  return lines.join("\n");
}

export function buildAnswerSummary(assignment, result) {
  const items = getQuizItems(assignment);
  if (items.length === 0) return "";
  const { earned, max, grade100 } = result;
  if (grade100 == null) return `Quiz: ${items.length} question(s) (no auto-scored items).`;
  return `Quiz auto-score: ${grade100}/100 (${earned}/${max} auto pts, ${items.length} items).`;
}
