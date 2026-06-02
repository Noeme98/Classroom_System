import { useEffect, useMemo, useState } from "react";

import StudentQuizForm from "../quiz/StudentQuizForm";
import { getQuizItems } from "../quiz/quizTypes";
import { getSubmission, isSubmissionLocked, submitAssignment } from "./submissionUtils";
import { isValidUuid } from "../../utils/uuid";
import { emitCelebration } from "../../utils/celebrationEvents";

import styles from "./AssignmentList.module.css";

function AssignmentList({
  assignments,
  classId,
  studentEmail,
  focusAssignmentId = "",
  embedded = false,
  onSubmitted,
}) {
  const [activeId, setActiveId] = useState(null);
  const [answer, setAnswer] = useState("");
  const [quizAnswersByAssignment, setQuizAnswersByAssignment] = useState({});
  const [message, setMessage] = useState("");

  const sortedAssignments = useMemo(
    () =>
      [...(assignments || [])].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      ),
    [assignments]
  );

  const nextUpId = useMemo(() => {
    for (const assignment of sortedAssignments) {
      const sub = getSubmission(assignment.id, studentEmail);
      if (!sub || sub.returnedForRevision) return assignment.id;
    }
    return null;
  }, [sortedAssignments, studentEmail]);

  useEffect(() => {
    if (!focusAssignmentId || !isValidUuid(focusAssignmentId)) return;
    const exists = sortedAssignments.some((a) => a.id === focusAssignmentId);
    if (exists) setActiveId(focusAssignmentId);
  }, [focusAssignmentId, sortedAssignments]);

  useEffect(() => {
    if (!focusAssignmentId || activeId !== focusAssignmentId) return;
    const el = document.getElementById(`assignment-${focusAssignmentId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusAssignmentId, activeId]);

  const quizValue = (assignmentId) => quizAnswersByAssignment[assignmentId] || {};

  const handleSubmit = async (assignment) => {
    const items = getQuizItems(assignment);
    const quizAnswers = items.length > 0 ? quizValue(assignment.id) : null;
    const result = await submitAssignment(assignment.id, studentEmail, answer, classId, quizAnswers);

    setMessage(result.message);

    if (result.success) {
      emitCelebration({ type: "submission" });
      if (result.progression?.totalXP) {
        emitCelebration({
          type: "xp",
          amount: result.progression.totalXP,
          earlyBonus: result.progression.earlyBonus,
          streakBonus: result.progression.streakBonus,
        });
        if (result.progression.leveledUp) {
          emitCelebration({ type: "level-up", level: result.progression.levelAfter });
        }
      }
      setActiveId(null);
      setAnswer("");
      setQuizAnswersByAssignment((prev) => {
        const next = { ...prev };
        delete next[assignment.id];
        return next;
      });
      onSubmitted?.();
    }
  };

  const listBody =
    !assignments || assignments.length === 0 ? (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <i className="ti ti-clipboard" aria-hidden="true" />
        </div>
        <h4>No assignments yet</h4>
        <p>Your teacher hasn&apos;t posted work for this class. Check announcements for updates.</p>
      </div>
    ) : (
      <ul className={styles.list}>
        {sortedAssignments.map((assignment) => {
          const submitted = getSubmission(assignment.id, studentEmail);
          const locked = isSubmissionLocked(assignment, submitted);
          const needsResubmit = submitted?.returnedForRevision;
          const quizItems = getQuizItems(assignment);
          const isQuiz = quizItems.length > 0;
          const isNextUp = assignment.id === nextUpId;
          const hasFinalGrade =
            submitted &&
            submitted.grade !== null &&
            submitted.grade !== undefined &&
            Number.isFinite(Number(submitted.grade));
          const showAutoPending =
            submitted &&
            !hasFinalGrade &&
            submitted.autoScore != null &&
            submitted.autoMaxScore != null &&
            submitted.autoMaxScore > 0;
          const due = new Date(assignment.dueDate);
          const now = new Date();
          const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const dueClass =
            diffDays < 0
              ? styles.dueLate
              : diffDays <= 1
                ? styles.dueSoon
                : styles.dueOk;

          return (
            <li
              key={assignment.id}
              id={`assignment-${assignment.id}`}
              className={`${styles.card} ${isNextUp ? styles.cardNextUp : ""}`}
            >
              <div className={styles.cardTop}>
                <div>
                  {isNextUp && <span className={styles.nextUpBadge}>Up next</span>}
                  <p className={styles.title}>{assignment.title}</p>
                </div>
                <span className={`${styles.duePill} ${dueClass}`}>
                  {diffDays < 0
                    ? "Overdue"
                    : diffDays === 0
                      ? "Due today"
                      : `${diffDays}d left`}
                </span>
              </div>
              <p className={styles.description}>{assignment.description}</p>
              {assignment.resourceUrl ? (
                <a
                  className={styles.resourceLink}
                  href={assignment.resourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="ti ti-link" aria-hidden="true" /> Open materials
                </a>
              ) : null}
              {isQuiz && (
                <p className={styles.quizHint}>
                  <i className="ti ti-list-check" aria-hidden="true" /> Quiz assignment
                </p>
              )}
              {locked && !submitted && (
                <span className={styles.closedPill}>
                  <i className="ti ti-lock" aria-hidden="true" /> Submission closed
                </span>
              )}
              {needsResubmit && (
                <span className={styles.returnPill}>
                  <i className="ti ti-refresh" aria-hidden="true" /> Returned — revise and resubmit
                </span>
              )}

              {submitted && !needsResubmit ? (
                <div className={styles.statusBlock}>
                  <span className={styles.submittedBadge}>
                    <i className="ti ti-check" aria-hidden="true" /> Submitted
                  </span>
                  {hasFinalGrade ? (
                    <div className={styles.gradeBox}>
                      <p className={styles.gradeText}>Score: {submitted.grade}/100</p>
                      <p className={styles.feedbackText}>
                        {submitted.feedback
                          ? submitted.feedback
                          : "No feedback provided yet."}
                      </p>
                    </div>
                  ) : showAutoPending ? (
                    <p className={styles.pendingGrade}>
                      Auto-score: {submitted.autoScore}/{submitted.autoMaxScore} — teacher may adjust
                      final grade.
                    </p>
                  ) : (
                    <p className={styles.pendingGrade}>
                      <i className="ti ti-clock" aria-hidden="true" /> Waiting for teacher grade
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.answerBtn}
                    disabled={locked && !needsResubmit}
                    onClick={() => setActiveId(activeId === assignment.id ? null : assignment.id)}
                  >
                    {locked && !needsResubmit
                      ? "Closed"
                      : activeId === assignment.id
                        ? "Cancel"
                        : needsResubmit
                          ? "Resubmit"
                          : "Submit work"}
                  </button>

                  {activeId === assignment.id && (
                    <div className={styles.answerBox}>
                      {isQuiz ? (
                        <StudentQuizForm
                          assignment={assignment}
                          value={quizValue(assignment.id)}
                          onChange={(v) =>
                            setQuizAnswersByAssignment((prev) => ({ ...prev, [assignment.id]: v }))
                          }
                        />
                      ) : (
                        <textarea
                          className={styles.textarea}
                          placeholder="Type your answer here..."
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          rows={4}
                        />
                      )}
                      <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={() => handleSubmit(assignment)}
                      >
                        <i className="ti ti-send" aria-hidden="true" />
                        {needsResubmit ? "Resubmit answer" : "Submit answer"}
                      </button>
                      {message && activeId === assignment.id && (
                        <p className={styles.message}>{message}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    );

  if (!embedded) {
    return (
      <div className={styles.wrapper}>
        <h3 className={styles.heading}>Assignments</h3>
        {listBody}
      </div>
    );
  }

  return (
    <section className={styles.pageCard}>
      <div className={styles.pageHead}>
        <h2 className={styles.pageTitle}>
          <i className="ti ti-clipboard-list" aria-hidden="true" />
          Assignments
        </h2>
        <span className={styles.pageBadge}>{sortedAssignments.length}</span>
      </div>
      <div className={styles.pageBody}>{listBody}</div>
    </section>
  );
}

export default AssignmentList;
