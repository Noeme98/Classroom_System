// ── Helpers ──────────────────────────────────────────────
import { getItem, setItem } from "../../utils/storage";
import { notifyUsers } from "../../utils/notificationUtils";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";
import { isValidUuid } from "../../utils/uuid";
import { isMissingColumnError } from "../../utils/supabaseErrors";
import { ASSIGNMENT_SELECT_CORE, ASSIGNMENT_SELECT_FULL } from "../../utils/supabaseSelect";
import { QUIZ_SCHEMA_VERSION, newQuestionId } from "../quiz/quizTypes";

// Generate a short random ID for each assignment
const makeId = () => "asgn_" + Math.random().toString(36).slice(2, 8);
const ASSIGNMENTS_KEY = "assignments";

// ── Read / Write ──────────────────────────────────────────

// Get all assignments from localStorage
// Returns an empty array if nothing is saved yet
export function getAssignments() {
  return getItem(ASSIGNMENTS_KEY) || [];
}

// Save the full assignments array back to localStorage
function saveAssignments(assignments) {
  setItem(ASSIGNMENTS_KEY, assignments);
}

const toClientAssignment = (row) => ({
  id: row.id,
  classId: row.class_id,
  title: row.title,
  description: row.description,
  dueDate: row.due_date,
  createdAt: row.created_at,
  questions: row.questions ?? { schemaVersion: QUIZ_SCHEMA_VERSION, items: [] },
  resourceUrl: row.resource_url || "",
  allowLate: row.allow_late !== false,
});

function toStrArray(v) {
  return Array.isArray(v) ? v : [];
}

/** Normalize quiz items from the builder before save. */
export function sanitizeQuizItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const out = [];
  for (const q of rawItems) {
    if (!q || !String(q.prompt || "").trim()) continue;
    const points = Math.min(100, Math.max(1, Number(q.points) || 1));
    const id = String(q.id || "").trim() || newQuestionId();
    const base = { id, prompt: String(q.prompt).trim(), points };
    switch (q.type) {
      case "mcq": {
        const options = (q.options || [])
          .map((o) => ({ id: String(o.id || "").trim(), label: String(o.label || "").trim() }))
          .filter((o) => o.label && o.id);
        if (options.length < 2) continue;
        let correctOptionId = q.correctOptionId;
        if (!options.some((o) => o.id === correctOptionId)) correctOptionId = options[0].id;
        out.push({ ...base, type: "mcq", options, correctOptionId });
        break;
      }
      case "true_false":
        out.push({
          ...base,
          type: "true_false",
          correctTrueFalse: q.correctTrueFalse === false ? false : true,
        });
        break;
      case "identification": {
        const acceptableAnswers = [
          ...new Set(
            toStrArray(q.acceptableAnswers)
              .map((a) => String(a || "").trim())
              .filter(Boolean)
          ),
        ];
        if (acceptableAnswers.length === 0) continue;
        out.push({ ...base, type: "identification", acceptableAnswers });
        break;
      }
      case "multi_select": {
        const options = (q.options || [])
          .map((o) => ({ id: String(o.id || "").trim(), label: String(o.label || "").trim() }))
          .filter((o) => o.label && o.id);
        if (options.length < 2) continue;
        const correctOptionIds = [
          ...new Set(toStrArray(q.correctOptionIds).map(String).filter((cid) => options.some((o) => o.id === cid))),
        ];
        if (correctOptionIds.length < 1) continue;
        out.push({ ...base, type: "multi_select", options, correctOptionIds });
        break;
      }
      case "essay":
        out.push({ ...base, type: "essay" });
        break;
      default:
        break;
    }
  }
  return out;
}

export async function syncAssignmentsByClass(classId) {
  if (!classId || !isValidUuid(classId) || !isSupabaseConfigured) {
    return getAssignmentsByClass(classId);
  }

  try {
    let { data, error } = await supabase
      .from("assignments")
      .select(ASSIGNMENT_SELECT_FULL)
      .eq("class_id", classId)
      .order("created_at", { ascending: false });
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from("assignments")
        .select(ASSIGNMENT_SELECT_CORE)
        .eq("class_id", classId)
        .order("created_at", { ascending: false }));
    }
    if (error) throw error;

    const synced = (data || []).map(toClientAssignment);
    const current = getAssignments();
    const others = current.filter((assignment) => String(assignment.classId) !== String(classId));
    saveAssignments([...others, ...synced]);
    return synced;
  } catch {
    return getAssignmentsByClass(classId);
  }
}

// ── Create ────────────────────────────────────────────────

// Called when a teacher clicks "Post Assignment"
// classId   — which class this assignment belongs to
// title     — assignment title
// description — what students need to do
// dueDate   — deadline string e.g. "2025-02-01"
// quizItems — optional array from QuizBuilder; sanitized into `questions` JSON
export async function createAssignment(
  classId,
  title,
  description,
  dueDate,
  quizItems = null,
  resourceUrl = "",
  allowLate = true
) {
  // Validate — all fields required
  if (!classId || !title || !description || !dueDate) {
    return { success: false, message: "Please fill in all fields" };
  }

  const sanitizedQuiz = Array.isArray(quizItems) ? sanitizeQuizItems(quizItems) : [];
  const questions = { schemaVersion: QUIZ_SCHEMA_VERSION, items: sanitizedQuiz };
  const link = String(resourceUrl || "").trim();

  let newAssignment;
  let updated;
  if (isSupabaseConfigured) {
    try {
      const corePayload = {
        class_id: classId,
        title,
        description,
        due_date: dueDate,
        questions,
      };
      const fullPayload = {
        ...corePayload,
        resource_url: link || null,
        allow_late: Boolean(allowLate),
      };
      let { data, error } = await supabase
        .from("assignments")
        .insert(fullPayload)
        .select(ASSIGNMENT_SELECT_FULL)
        .single();
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
          .from("assignments")
          .insert(corePayload)
          .select(ASSIGNMENT_SELECT_CORE)
          .single());
      }
      if (error) throw error;
      newAssignment = toClientAssignment(data);
      updated = [...getAssignments(), newAssignment];
      saveAssignments(updated);
    } catch (err) {
      return { success: false, message: err.message || "Failed to post assignment." };
    }
  } else {
    const assignments = getAssignments();
    newAssignment = {
      id: makeId(),
      classId,
      title,
      description,
      dueDate,
      createdAt: new Date().toISOString(),
      questions,
      resourceUrl: link,
      allowLate: Boolean(allowLate),
    };
    updated = [...assignments, newAssignment];
    saveAssignments(updated);
  }

  const classes = getItem("classes") || [];
  const classStudents = getItem("classStudents") || {};
  const className =
    classes.find((entry) => String(entry.id) === String(classId))?.name || "your class";
  const recipients = classStudents[String(classId)] || [];
  notifyUsers({
    recipientEmails: recipients,
    title: "New assignment posted",
    body: `${title} was posted in ${className}.`,
    type: "assignment",
    meta: { assignmentId: newAssignment.id, classId },
  });

  return { success: true, message: "Assignment posted!", assignments: updated };
}

// ── Filter ────────────────────────────────────────────────

// Get only the assignments that belong to a specific class
// Used by both teacher (to display) and student (to see their work)
export function getAssignmentsByClass(classId) {
  // Important: normalize id types so seeded numeric IDs and UI string IDs both match.
  return getAssignments().filter((a) => String(a.classId) === String(classId));
}