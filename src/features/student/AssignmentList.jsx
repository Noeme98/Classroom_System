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
  const [filter, setFilter] = useState("all");
  const [answer, setAnswer] = useState("");
  const [quizAnswersByAssignment, setQuizAnswersByAssignment] = useState({});
  const [tabByAssignment, setTabByAssignment] = useState({});
  const [filesByAssignment, setFilesByAssignment] = useState({});
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

  const firstSubmittedId = useMemo(() => {
    for (const assignment of sortedAssignments) {
      const sub = getSubmission(assignment.id, studentEmail);
      if (sub && !sub.returnedForRevision) return assignment.id;
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
  const activeTab = (assignmentId) => tabByAssignment[assignmentId] || "answer";
  const formatStamp = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  };

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
      <>
        <div className={styles.filters}>
          {[
            ["all", "All"],
            ["pending", "Pending"],
            ["submitted", "Submitted"],
            ["overdue", "Overdue"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${filter === key ? styles.chipOn : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
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
          const statusClass = submitted && !needsResubmit
            ? styles.cardSubmitted
            : diffDays < 0
              ? styles.cardOverdue
              : styles.cardPending;
          const iconClass = submitted && !needsResubmit
            ? styles.iconGreen
            : diffDays < 0
              ? styles.iconRed
              : styles.iconPurple;
          const statusBadgeClass = submitted && !needsResubmit
            ? styles.badgeGreen
            : diffDays < 0
              ? styles.badgeRed
              : styles.badgePurple;
          const statusIcon = submitted && !needsResubmit
            ? "ti ti-circle-check"
            : diffDays < 0
              ? "ti ti-alert-triangle"
              : "ti ti-clipboard-text";
          const statusText = submitted && !needsResubmit
            ? "Submitted"
            : diffDays < 0
              ? "Overdue"
              : needsResubmit
                ? "Needs revision"
                : "Pending";
          const statusKey = submitted && !needsResubmit
            ? "submitted"
            : diffDays < 0
              ? "overdue"
              : "pending";
          const shouldShow = (filter === "all" || filter === statusKey) && (!activeId || activeId === assignment.id);
          const xpValue = Number(assignment?.xp ?? assignment?.xpReward ?? assignment?.points ?? 0) || 0;
          const stageStates = {
            assigned: true,
            submitted: Boolean(submitted),
            returned: Boolean(needsResubmit),
            resubmitted: Boolean(submitted && !needsResubmit && submitted?.submittedAt && submitted?.gradedAt),
            graded: Boolean(hasFinalGrade),
          };

          if (!shouldShow) return null;

          return (
            <li key={assignment.id}>
              {filter === "all" && !submitted && diffDays >= 0 && assignment.id === nextUpId && (
                <div className={styles.dividerLabel}>Due this week</div>
              )}
              {filter === "all" && submitted && assignment.id === firstSubmittedId && (
                <div className={styles.dividerLabel}>Completed</div>
              )}
              <div
                id={`assignment-${assignment.id}`}
                className={`${styles.card} ${statusClass} ${isNextUp ? styles.cardNextUp : ""}`}
              >
                <div className={styles.cardMain}>
                  <div className={`${styles.cardIcon} ${iconClass}`}>
                    <i className={statusIcon} aria-hidden="true" />
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.cardTop}>
                      <div>
                        {isNextUp && <span className={styles.nextUpBadge}>Up next</span>}
                        <p className={styles.title}>{assignment.title}</p>
                        <p className={styles.classLine}>{assignment.subject || "Class assignment"}</p>
                      </div>
                      <span className={`${styles.statusBadge} ${statusBadgeClass}`}>{statusText}</span>
                    </div>
                    <p className={styles.description}>{assignment.description}</p>
                    <div className={styles.metaRow}>
                      <span className={`${styles.metaItem} ${styles.duePill} ${dueClass}`}>
                        <i className="ti ti-calendar" aria-hidden="true" />
                        {diffDays < 0
                          ? "Overdue"
                          : diffDays === 0
                            ? "Due today"
                            : `${diffDays}d left`}
                      </span>
                      {assignment.resourceUrl ? (
                        <a
                          className={`${styles.metaItem} ${styles.resourceLink}`}
                          href={assignment.resourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <i className="ti ti-link" aria-hidden="true" /> Material attached
                        </a>
                      ) : null}
                      {isQuiz && (
                        <p className={`${styles.metaItem} ${styles.quizHint}`}>
                          <i className="ti ti-list-check" aria-hidden="true" /> Quiz assignment
                        </p>
                      )}
                      {xpValue > 0 && (
                        <span className={styles.metaItem}>
                          <i className="ti ti-bolt" aria-hidden="true" /> +{xpValue} XP
                        </span>
                      )}
                    </div>
                  </div>
                </div>
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
                    <div className={styles.timeline}>
                      <span className={`${styles.stagePill} ${stageStates.assigned ? styles.stageOn : ""}`}>
                        Assigned
                      </span>
                      <span className={`${styles.stagePill} ${stageStates.submitted ? styles.stageOn : ""}`}>
                        Submitted
                      </span>
                      <span className={`${styles.stagePill} ${stageStates.graded ? styles.stageOn : ""}`}>
                        Graded
                      </span>
                    </div>
                    <span className={styles.submittedBadge}>
                      <i className="ti ti-check" aria-hidden="true" /> Submitted
                    </span>
                    <p className={styles.historyLine}>Submitted at {formatStamp(submitted?.submittedAt)}</p>
                    {hasFinalGrade ? (
                      <div className={styles.gradeBox}>
                        <p className={styles.gradeText}>Score: {submitted.grade}/100</p>
                        {submitted?.gradedAt && (
                          <p className={styles.historyLine}>Graded at {formatStamp(submitted.gradedAt)}</p>
                        )}
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
                    <div className={styles.timeline}>
                      <span className={`${styles.stagePill} ${stageStates.assigned ? styles.stageOn : ""}`}>
                        Assigned
                      </span>
                      <span className={`${styles.stagePill} ${stageStates.submitted ? styles.stageOn : ""}`}>
                        Submitted
                      </span>
                      <span className={`${styles.stagePill} ${stageStates.returned ? styles.stageWarn : ""}`}>
                        Returned
                      </span>
                      <span className={`${styles.stagePill} ${stageStates.graded ? styles.stageOn : ""}`}>
                        Graded
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.answerBtn}
                      disabled={locked && !needsResubmit}
                      onClick={() => setActiveId(activeId === assignment.id ? null : assignment.id)}
                    >
                      {locked && !needsResubmit
                        ? "Closed"
                        : activeId === assignment.id
                          ? "Back to list"
                          : needsResubmit
                            ? "Open resubmission"
                            : "Open assignment"}
                    </button>

                    {activeId === assignment.id && (
                      <div className={styles.answerBox}>
                        <div className={styles.tabs}>
                          <button
                            type="button"
                            className={`${styles.tab} ${
                              activeTab(assignment.id) === "answer" ? styles.tabOn : ""
                            }`}
                            onClick={() =>
                              setTabByAssignment((prev) => ({ ...prev, [assignment.id]: "answer" }))
                            }
                          >
                            Answer
                          </button>
                          <button
                            type="button"
                            className={`${styles.tab} ${
                              activeTab(assignment.id) === "checklist" ? styles.tabOn : ""
                            }`}
                            onClick={() =>
                              setTabByAssignment((prev) => ({ ...prev, [assignment.id]: "checklist" }))
                            }
                          >
                            Checklist
                          </button>
                        </div>

                        {activeTab(assignment.id) === "answer" ? (
                          <>
                            {!isQuiz && (
                              <>
                                <label className={styles.sectionLabel}>Upload your work</label>
                                <label className={styles.uploadZone}>
                                  <input
                                    type="file"
                                    multiple
                                    className={styles.fileInput}
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || []).map((f) => f.name);
                                      if (!files.length) return;
                                      setFilesByAssignment((prev) => ({
                                        ...prev,
                                        [assignment.id]: [...(prev[assignment.id] || []), ...files],
                                      }));
                                    }}
                                  />
                                  <i className="ti ti-cloud-upload" aria-hidden="true" />
                                  <p>Click to upload or drag & drop</p>
                                  <span>PDF, DOCX, JPG, PNG</span>
                                </label>
                                {(filesByAssignment[assignment.id] || []).length > 0 && (
                                  <div className={styles.fileList}>
                                    {(filesByAssignment[assignment.id] || []).map((name, idx) => (
                                      <span key={`${name}-${idx}`} className={styles.fileChip}>
                                        <i className="ti ti-file" aria-hidden="true" />
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <label className={styles.sectionLabel}>Notes for teacher</label>
                              </>
                            )}
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
                                placeholder="Add your response or context for your teacher..."
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                rows={5}
                              />
                            )}
                            <div className={styles.btnRow}>
                              <button
                                type="button"
                                className={styles.submitBtn}
                                onClick={() => handleSubmit(assignment)}
                              >
                                <i className="ti ti-send" aria-hidden="true" />
                                {needsResubmit ? "Resubmit answer" : "Submit"}
                              </button>
                              <button
                                type="button"
                                className={styles.ghostBtn}
                                onClick={() => setMessage("Draft saved locally.")}
                              >
                                Save draft
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className={styles.checklist}>
                            {[
                              "Read the full instructions carefully",
                              "Answered all parts of the question",
                              "Proofread your work",
                              "Checked for proper formatting",
                            ].map((item) => (
                              <label key={item} className={styles.checkItem}>
                                <input type="checkbox" />
                                <span>{item}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {message && activeId === assignment.id && (
                          <p className={styles.message}>{message}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
        </ul>
      </>
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
      <div className={styles.pageHeader}>
        <h3>My Assignments</h3>
        <p>Everything on your plate across joined classes.</p>
      </div>
      <div className={styles.pageHead}>
        <h2 className={styles.pageTitle}>
          <i className="ti ti-clipboard-list" aria-hidden="true" />
          {activeId ? "Assignment details" : "Assignments"}
        </h2>
        {activeId ? (
          <button type="button" className={styles.backBtn} onClick={() => setActiveId(null)}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back
          </button>
        ) : (
          <span className={styles.pageBadge}>{sortedAssignments.length}</span>
        )}
      </div>
      <div className={styles.pageBody}>{listBody}</div>
    </section>
  );
}

export default AssignmentList;
