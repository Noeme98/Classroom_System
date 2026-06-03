// Import storage helpers
import { getItem, setItem } from "../../utils/storage";

// Import XP system
import { awardSubmissionProgress, awardGradingBonus, syncXPByClass } from "../system/xpUtils";
import { getAssignments } from "../teacher/assignmentUtils";
import { notifyUsers } from "../../utils/notificationUtils";
import { getTeacherEmailForClass } from "../teacher/teacherUtils";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";
import { isValidUuid } from "../../utils/uuid";
import { isMissingColumnError } from "../../utils/supabaseErrors";
import { SUBMISSION_SELECT_CORE, SUBMISSION_SELECT_FULL } from "../../utils/supabaseSelect";
import { getQuizItems } from "../quiz/quizTypes";
import {
  buildAnswerSummary,
  buildAutoFeedback,
  computeAutoGrade,
  validateQuizAnswers,
} from "../quiz/autoGrade.js";

// Storage key
const SUBMISSIONS_KEY = "submissions";
const saveSubmissions = (submissions) => setItem(SUBMISSIONS_KEY, submissions);

const formatDbError = (err, fallback) => {
  const msg = String(err?.message || "").trim();
  if (!msg) return fallback;
  if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("not allowed")) {
    return "You are not allowed to perform this action.";
  }
  return msg;
};

async function writeSubmissionRow(writeFn) {
  let result = await writeFn(SUBMISSION_SELECT_FULL);
  if (result.error && isMissingColumnError(result.error)) {
    result = await writeFn(SUBMISSION_SELECT_CORE);
  }
  return result;
}

const getProfileIdByEmail = async (email) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

const mapSubmissionsWithEmails = async (rows) => {
  const ids = [...new Set(rows.map((row) => row.student_id).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data: profiles, error } = await supabase.from("profiles").select("id, email").in("id", ids);
  if (error) throw error;
  const emailById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.email]));
  return rows.map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    studentEmail: emailById[row.student_id] || "unknown@school.edu",
    classId: row.class_id,
    answer: row.answer,
    answers: row.answers ?? null,
    autoScore: row.auto_score != null ? Number(row.auto_score) : null,
    autoMaxScore: row.auto_max_score != null ? Number(row.auto_max_score) : null,
    submittedAt: row.submitted_at,
    grade: row.grade ?? null,
    feedback: row.feedback || "",
    gradedAt: row.graded_at || null,
    returnedForRevision: row.returned_for_revision != null ? Boolean(row.returned_for_revision) : false,
  }));
};

const getAssignmentDeadline = (assignment) => {
  if (!assignment?.dueDate) return null;
  const dueAt = new Date(`${assignment.dueDate}T23:59:59`);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
};

export const isSubmissionLocked = (assignment, submission = null) => {
  if (submission?.returnedForRevision) return false;
  if (assignment?.allowLate !== false) return false;
  const deadline = getAssignmentDeadline(assignment);
  if (!deadline) return false;
  return new Date() > deadline;
};

// ─────────────────────────────────────────
// getSubmissions()
// Returns all submissions
// ─────────────────────────────────────────
export const getSubmissions = () => {
  return getItem(SUBMISSIONS_KEY) || [];
};

export const syncSubmissionsByClass = async (classId) => {
  if (!classId || !isValidUuid(classId) || !isSupabaseConfigured) {
    return getSubmissions().filter((entry) => String(entry.classId) === String(classId));
  }
  try {
    let { data, error } = await supabase
      .from("submissions")
      .select(SUBMISSION_SELECT_FULL)
      .eq("class_id", classId)
      .order("submitted_at", { ascending: false });
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from("submissions")
        .select(SUBMISSION_SELECT_CORE)
        .eq("class_id", classId)
        .order("submitted_at", { ascending: false }));
    }
    if (error) throw error;
    const mapped = await mapSubmissionsWithEmails(data || []);
    const current = getSubmissions();
    const others = current.filter((entry) => String(entry.classId) !== String(classId));
    saveSubmissions([...others, ...mapped]);
    return mapped;
  } catch {
    return getSubmissions().filter((entry) => String(entry.classId) === String(classId));
  }
};

// ─────────────────────────────────────────
// getSubmission()
// Returns one student's submission for an assignment
// ─────────────────────────────────────────
export const getSubmission = (assignmentId, studentEmail) => {
  const allSubmissions = getSubmissions();

  return (
    allSubmissions.find(
      (s) =>
        s.assignmentId === assignmentId &&
        s.studentEmail === studentEmail
    ) || null
  );
};

// ─────────────────────────────────────────
// submitAssignment()
// Saves submission + awards XP
// ─────────────────────────────────────────
// quizAnswers — when assignment has quiz items, object keyed by question id
export const submitAssignment = async (assignmentId, studentEmail, answer, classId, quizAnswers = null) => {
  // Validate required fields
  if (!assignmentId || !studentEmail || !classId) {
    return {
      success: false,
      message: "Missing required submission data.",
    };
  }

  const assignment = getAssignments().find((item) => item.id === assignmentId);
  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  const quizItems = getQuizItems(assignment);
  const hasQuiz = quizItems.length > 0;

  let answerText = String(answer || "").trim();
  let answersJson = null;
  let insertGrade = null;
  let insertFeedback = "";
  let gradedAt = null;
  let autoEarned = null;
  let autoMax = null;

  if (hasQuiz) {
    const answers = quizAnswers && typeof quizAnswers === "object" ? quizAnswers : {};
    const val = validateQuizAnswers(quizItems, answers);
    if (!val.ok) {
      return { success: false, message: val.message };
    }
    const result = computeAutoGrade(quizItems, answers);
    answersJson = answers;
    answerText = buildAnswerSummary(assignment, result);
    insertFeedback = buildAutoFeedback(result.details, result.hasEssay);
    autoEarned = result.earned;
    autoMax = result.max;
    if (result.grade100 != null && Number.isFinite(result.grade100)) {
      insertGrade = result.grade100;
      gradedAt = new Date().toISOString();
    } else {
      insertFeedback = `${insertFeedback}\n\n(Essay-only or unscored items — teacher will assign the overall score.)`.trim();
    }
  } else {
    if (!answerText) {
      return {
        success: false,
        message: "Please write an answer before submitting.",
      };
    }
  }

  const existing = getSubmission(assignmentId, studentEmail);

  if (existing && !existing.returnedForRevision) {
    return {
      success: false,
      message: "You have already submitted this assignment.",
    };
  }

  if (isSubmissionLocked(assignment, existing)) {
    return {
      success: false,
      message: "Submission is closed. The deadline has passed.",
    };
  }

  let newSubmission;
  const isResubmit = Boolean(existing?.returnedForRevision);

  if (isSupabaseConfigured) {
    try {
      const studentId = await getProfileIdByEmail(studentEmail);
      if (!studentId) {
        return { success: false, message: "Student profile not found in database." };
      }
      const buildPayload = (includeRevisionFlag) => {
        const payload = {
          answer: answerText || (hasQuiz ? "Quiz submission" : ""),
          submitted_at: new Date().toISOString(),
          feedback: insertFeedback || "",
        };
        if (includeRevisionFlag) {
          payload.returned_for_revision = false;
        }
        return payload;
      };
      let payload = buildPayload(true);
      if (answersJson != null) payload.answers = answersJson;
      if (autoEarned != null && autoMax != null) {
        payload.auto_score = autoEarned;
        payload.auto_max_score = autoMax;
      }
      if (insertGrade != null && Number.isFinite(insertGrade)) {
        payload.grade = insertGrade;
        payload.graded_at = gradedAt;
      } else if (isResubmit) {
        payload.grade = null;
        payload.graded_at = null;
      }

      if (isResubmit) {
        const runUpdate = (selectCols) =>
          supabase.from("submissions").update(payload).eq("id", existing.id).select(selectCols).single();
        let { data, error } = await writeSubmissionRow(runUpdate);
        if (error && isMissingColumnError(error)) {
          payload = buildPayload(false);
          ({ data, error } = await writeSubmissionRow(runUpdate));
        }
        if (error) throw error;
        newSubmission = (await mapSubmissionsWithEmails([data]))[0];
        const rest = getSubmissions().filter((s) => s.id !== existing.id);
        saveSubmissions([...rest, newSubmission]);
      } else {
        const runInsert = (selectCols) =>
          supabase
            .from("submissions")
            .insert({
              assignment_id: assignmentId,
              class_id: classId,
              student_id: studentId,
              ...payload,
            })
            .select(selectCols)
            .single();
        let { data, error } = await writeSubmissionRow(runInsert);
        if (error && isMissingColumnError(error)) {
          payload = buildPayload(false);
          ({ data, error } = await writeSubmissionRow(runInsert));
        }
        if (error) throw error;
        newSubmission = (await mapSubmissionsWithEmails([data]))[0];
        saveSubmissions([...getSubmissions(), newSubmission]);
      }
    } catch (err) {
      return { success: false, message: err.message || "Failed to submit assignment." };
    }
  } else if (isResubmit) {
    newSubmission = {
      ...existing,
      answer: answerText || (hasQuiz ? "Quiz submission" : ""),
      answers: answersJson,
      autoScore: autoEarned,
      autoMaxScore: autoMax,
      submittedAt: new Date().toISOString(),
      grade: insertGrade,
      feedback: insertFeedback,
      gradedAt,
      returnedForRevision: false,
    };
    const rest = getSubmissions().filter((s) => s.id !== existing.id);
    saveSubmissions([...rest, newSubmission]);
  } else {
    newSubmission = {
      id: "sub_" + Date.now(),
      assignmentId,
      studentEmail,
      classId,
      answer: answerText || (hasQuiz ? "Quiz submission" : ""),
      answers: answersJson,
      autoScore: autoEarned,
      autoMaxScore: autoMax,
      submittedAt: new Date().toISOString(),
      grade: insertGrade,
      feedback: insertFeedback,
      gradedAt,
      returnedForRevision: false,
    };
    saveSubmissions([...getSubmissions(), newSubmission]);
  }

  let progression = null;
  if (!isResubmit) {
    try {
      progression = awardSubmissionProgress({
        studentEmail,
        classId,
        dueDate: assignment?.dueDate,
        submittedAt: newSubmission.submittedAt,
      });
    } catch (err) {
      console.error("XP system failed:", err);
    }
  }

  let gradingBonusMsg = "";
  if (insertGrade != null && Number.isFinite(insertGrade)) {
    try {
      const gb = awardGradingBonus({ studentEmail, classId, score: insertGrade });
      gradingBonusMsg =
        gb.bonusXP > 0
          ? ` Auto-grade bonus: +${gb.bonusXP} XP.${gb.unlockedBadges?.length ? ` Badges: ${gb.unlockedBadges.join(", ")}.` : ""}`
          : "";
    } catch (err) {
      console.error("Grading bonus failed:", err);
    }
  }

  const xpMessage = progression
    ? `Base ${10} XP${progression.earlyBonus ? ` + Early ${progression.earlyBonus}` : ""}${
        progression.streakBonus ? ` + Streak ${progression.streakBonus}` : ""
      }`
    : "Base 10 XP";

  const badgeMessage =
    progression && progression.unlockedBadges.length > 0
      ? ` Badges unlocked: ${progression.unlockedBadges.join(", ")}.`
      : "";

  const quizMsg = hasQuiz
    ? insertGrade != null
      ? ` Auto-score: ${insertGrade}/100.${gradingBonusMsg}`
      : " Submitted — essay items await teacher scoring."
    : "";

  try {
    const teacherEmail = await getTeacherEmailForClass(classId);
    if (teacherEmail) {
      notifyUsers({
        recipientEmails: [teacherEmail],
        title: isResubmit ? "Submission resubmitted" : "New submission to review",
        body: `${studentEmail} submitted "${assignment.title}".`,
        type: "assignment",
        meta: { classId, assignmentId },
      });
    }
  } catch (err) {
    console.error("Teacher submission notify failed:", err);
  }

  return {
    success: true,
    message: `Submitted successfully! ${xpMessage} earned ⚡.${badgeMessage}${quizMsg}`,
    submission: newSubmission,
    progression,
  };
};

// ─────────────────────────────────────────
// getSubmissionsByAssignment()
// Returns all submissions for an assignment
// ─────────────────────────────────────────
export const getSubmissionsByAssignment = (assignmentId) => {
  if (!assignmentId) return [];

  const all = getSubmissions();

  return all.filter((s) => s.assignmentId === assignmentId);
};

// ─────────────────────────────────────────
// gradeSubmission()
// Teacher updates score + feedback for a submission
// ─────────────────────────────────────────
export const gradeSubmission = async (submissionId, score, feedback = "") => {
  if (!submissionId) {
    return { success: false, message: "Missing submission id." };
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    return { success: false, message: "Score must be a number from 0 to 100." };
  }

  const all = getSubmissions();
  const index = all.findIndex((s) => s.id === submissionId);

  if (index === -1) {
    return { success: false, message: "Submission not found." };
  }

  // Important: persist grading metadata in one update so the UI can read a stable graded state.
  const updatedSubmission = {
    ...all[index],
    grade: numericScore,
    feedback: feedback.trim(),
    gradedAt: new Date().toISOString(),
  };

  let serverBonusXP = null;
  if (isSupabaseConfigured) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("grade_submission_with_bonus", {
        p_submission_id: submissionId,
        p_score: numericScore,
        p_feedback: feedback.trim(),
      });

      if (rpcError) throw rpcError;
      if (rpcData && typeof rpcData === "object") {
        serverBonusXP = Number(rpcData.bonus_xp);
      } else if (Array.isArray(rpcData) && rpcData.length > 0) {
        serverBonusXP = Number(rpcData[0]?.bonus_xp);
      }
    } catch (err) {
      return { success: false, message: formatDbError(err, "Failed to save grade in database.") };
    }
  }

  const updated = [...all];
  updated[index] = updatedSubmission;
  saveSubmissions(updated);

  let gradingProgress = null;
  let bonusInfo = "";
  let badgeInfo = "";
  if (isSupabaseConfigured) {
    try {
      await syncXPByClass(updatedSubmission.classId);
    } catch {
      // non-blocking local sync refresh
    }
    const resolvedBonus = Number.isFinite(serverBonusXP) ? serverBonusXP : 0;
    bonusInfo = ` +${resolvedBonus} XP performance bonus`;
  } else {
    try {
      // Local-only fallback keeps legacy behavior when DB is unavailable.
      gradingProgress = awardGradingBonus({
        studentEmail: updatedSubmission.studentEmail,
        classId: updatedSubmission.classId,
        score: numericScore,
      });
    } catch (err) {
      console.error("Grading bonus failed:", err);
    }
    bonusInfo = gradingProgress
      ? ` +${gradingProgress.bonusXP} XP performance bonus`
      : " grading bonus unavailable";
    badgeInfo =
      gradingProgress && gradingProgress.unlockedBadges.length > 0
        ? ` Badge unlocked: ${gradingProgress.unlockedBadges.join(", ")}.`
        : "";
  }

  notifyUsers({
    recipientEmails: [updatedSubmission.studentEmail],
    title: "Grade released",
    body: `Your submission was graded: ${numericScore}/100.`,
    type: "grade",
    meta: {
      classId: updatedSubmission.classId,
      assignmentId: updatedSubmission.assignmentId,
      submissionId: updatedSubmission.id,
    },
  });

  return {
    success: true,
    message: `Grade saved successfully (${bonusInfo}).${badgeInfo}`,
    submission: updatedSubmission,
  };
};

export const returnSubmissionForRevision = async (submissionId, note = "") => {
  if (!submissionId) {
    return { success: false, message: "Missing submission id." };
  }

  const all = getSubmissions();
  const index = all.findIndex((s) => s.id === submissionId);
  if (index === -1) {
    return { success: false, message: "Submission not found." };
  }

  const feedback =
    note.trim() ||
    "Please revise your work and resubmit. Your previous grade was cleared until you submit again.";

  const updatedSubmission = {
    ...all[index],
    grade: null,
    gradedAt: null,
    feedback,
    returnedForRevision: true,
  };

  if (isSupabaseConfigured) {
    try {
      const baseUpdate = { grade: null, graded_at: null, feedback };
      let { error } = await supabase
        .from("submissions")
        .update({ ...baseUpdate, returned_for_revision: true })
        .eq("id", submissionId);
      if (error && isMissingColumnError(error)) {
        ({ error } = await supabase.from("submissions").update(baseUpdate).eq("id", submissionId));
      }
      if (error) throw error;
    } catch (err) {
      return { success: false, message: err.message || "Failed to return submission." };
    }
  }

  const updated = [...all];
  updated[index] = updatedSubmission;
  saveSubmissions(updated);

  notifyUsers({
    recipientEmails: [updatedSubmission.studentEmail],
    title: "Work returned for revision",
    body: feedback,
    type: "assignment",
    meta: {
      classId: updatedSubmission.classId,
      assignmentId: updatedSubmission.assignmentId,
    },
  });

  return { success: true, message: "Returned to student for revision.", submission: updatedSubmission };
};