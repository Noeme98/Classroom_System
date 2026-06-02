import { useEffect, useRef, useState } from "react";
import {
  createAssignment,
  getAssignmentsByClass,
  syncAssignmentsByClass,
} from "./assignmentUtils";
import {
  getSubmissionsByAssignment,
  gradeSubmission,
  returnSubmissionForRevision,
  syncSubmissionsByClass,
} from "../student/submissionUtils";
import { isValidUuid } from "../../utils/uuid";
import styles from "./AssignmentPanel.module.css";

const FEEDBACK_TEMPLATES = [
  "Great work — keep it up!",
  "Please review the rubric and resubmit.",
  "Strong effort; expand your analysis.",
  "Missing required sections — see the description.",
];

// classes — the teacher's class list, passed in from TeacherView
function AssignmentPanel({
  classes,
  selectedClassId,
  initialAssignmentId = "",
  view = "all",
  embedded = false,
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [allowLate, setAllowLate] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [gradeScores, setGradeScores] = useState({});
  const [gradeFeedback, setGradeFeedback] = useState({});
  const [gradingMessage, setGradingMessage] = useState("");
  const [gradingType, setGradingType] = useState("");
  const [saving, setSaving] = useState(false);
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const gradingRef = useRef(null);
  // Get assignments for the currently selected class
  // Important: this keeps assignment data scoped to the class selected from TeacherView cards.
  const assignments = selectedClassId ? getAssignmentsByClass(selectedClassId) : [];
  const selectedClass = classes.find((cls) => String(cls.id) === String(selectedClassId));
  const selectedAssignmentExists = assignments.some((a) => a.id === selectedAssignment);
  const effectiveSelectedAssignment = selectedAssignmentExists ? selectedAssignment : "";
  const selectedAssignmentData = assignments.find((a) => a.id === effectiveSelectedAssignment) || null;
  const submissions = effectiveSelectedAssignment
    ? getSubmissionsByAssignment(effectiveSelectedAssignment)
    : [];
  const visibleSubmissions = ungradedOnly
    ? submissions.filter((s) => s.grade === null || s.grade === undefined)
    : submissions;
  useEffect(() => {
    const run = async () => {
      if (!selectedClassId) return;
      await syncAssignmentsByClass(selectedClassId);
      await syncSubmissionsByClass(selectedClassId);
      setGradingMessage("");
    };
    run();
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedClassId || !initialAssignmentId || !isValidUuid(initialAssignmentId)) return;
    const list = getAssignmentsByClass(selectedClassId);
    if (list.some((a) => a.id === initialAssignmentId)) {
      setSelectedAssignment(initialAssignmentId);
    }
  }, [selectedClassId, initialAssignmentId]);

  useEffect(() => {
    if (!initialAssignmentId || !effectiveSelectedAssignment) return;
    gradingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialAssignmentId, effectiveSelectedAssignment]);

  const applyFeedbackTemplate = (submissionId, text) => {
    setGradeFeedback((prev) => ({ ...prev, [submissionId]: text }));
  };

  const handlePost = async () => {
    setSaving(true);
    const result = await createAssignment(
      selectedClassId,
      title,
      description,
      dueDate,
      null,
      resourceUrl,
      allowLate
    );
    setSaving(false);
    setMessage(result.message);
    setMessageType(result.success ? "success" : "error");

    if (result.success) {
      setTitle("");
      setDescription("");
      setDueDate("");
      setResourceUrl("");
    }
  };

  const handleSaveGrade = async (submissionId) => {
    const score = gradeScores[submissionId];
    const feedback = gradeFeedback[submissionId] || "";
    const result = await gradeSubmission(submissionId, score, feedback);

    setGradingMessage(result.message);
    setGradingType(result.success ? "success" : "error");
  };

  const handleReturn = async (submissionId) => {
    const note = gradeFeedback[submissionId] || "";
    const result = await returnSubmissionForRevision(submissionId, note);
    setGradingMessage(result.message);
    setGradingType(result.success ? "success" : "error");
  };

  const showAssignments = view === "all" || view === "assignments";
  const showGrading = view === "all" || view === "grading";

  return (
    <div className={`${styles.wrapper} ${embedded ? styles.embedded : ""}`}>

      {showAssignments && (
      <>
      {/* ── Post Assignment form ── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>
            <i className="ti ti-plus" aria-hidden="true" />
            Post an assignment
          </h2>
          {selectedClass && (
            <span className={styles.headBadge}>Posting to: {selectedClass.name}</span>
          )}
        </div>
        <div className={styles.cardBody}>
        <div className={styles.field}>
          <label className={styles.label}>Title</label>
          <input
            type="text"
            placeholder="e.g. Essay on World War 2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={styles.input}
          />
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <textarea
            placeholder="Explain what students need to do..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.textarea}
            rows={3}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label}>Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Material link (optional)</label>
            <input
              type="url"
              placeholder="https://drive.google.com/…"
              value={resourceUrl}
              onChange={(e) => setResourceUrl(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={allowLate}
              onChange={(e) => setAllowLate(e.target.checked)}
            />
            <span>Allow late submissions (uncheck to lock at due date)</span>
          </label>
        </div>

        <button type="button" onClick={handlePost} className={styles.postBtn} disabled={!selectedClass || saving}>
          <i className="ti ti-upload" aria-hidden="true" />
          {saving ? "Posting..." : "Post assignment"}
        </button>

        {message && (
          <p className={`${styles.message} ${messageType === "success" ? styles.msgSuccess : styles.msgError}`}>
            {messageType === "success" ? "✅ " : "❌ "}
            {message}
          </p>
        )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>
            <i className="ti ti-clipboard-list" aria-hidden="true" />
            Posted assignments
          </h2>
          <span className={styles.headBadge}>{assignments.length}</span>
        </div>
        <div className={styles.cardBody}>
        {assignments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <i className="ti ti-clipboard" aria-hidden="true" />
            </div>
            <h4>No assignments posted yet</h4>
            <p>Post your first assignment above.</p>
          </div>
        ) : (
          <ul className={styles.assignmentList}>
            {assignments.map((a) => (
              <li key={a.id} className={styles.assignmentItem}>
                <div className={styles.assignmentIcon}>📄</div>
                <div className={styles.assignmentInfo}>
                  <span className={styles.assignmentTitle}>{a.title}</span>
                  <span className={styles.assignmentDesc}>{a.description}</span>
                </div>
                <div className={styles.dueBadge}>
                  <span className={styles.dueLabel}>Due</span>
                  <span className={styles.dueDate}>{a.dueDate}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>
      </>
      )}

      {showGrading && (
      <section className={styles.card} ref={gradingRef}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>
            <i className="ti ti-file-check" aria-hidden="true" />
            Student submissions
          </h2>
        </div>
        <div className={styles.cardBody}>
        {effectiveSelectedAssignment && submissions.length > 0 && (
          <label className={styles.filterRow}>
            <input
              type="checkbox"
              checked={ungradedOnly}
              onChange={(e) => setUngradedOnly(e.target.checked)}
            />
            <span>Show ungraded only ({submissions.filter((s) => s.grade == null).length})</span>
          </label>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Select assignment</label>
          <select
            value={effectiveSelectedAssignment}
            onChange={(e) => setSelectedAssignment(e.target.value)}
            className={styles.select}
            disabled={!selectedClass}
          >
            <option value="">
              {!selectedClass ? "Select a class first..." : "Select an assignment..."}
            </option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>

        {!effectiveSelectedAssignment ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <i className="ti ti-file-search" aria-hidden="true" />
            </div>
            <h4>No submissions yet</h4>
            <p>Select an assignment above to review and grade work.</p>
          </div>
        ) : visibleSubmissions.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <i className="ti ti-check" aria-hidden="true" />
            </div>
            <h4>{ungradedOnly ? "All caught up" : "No submissions yet"}</h4>
            <p>
              {ungradedOnly
                ? "All submissions for this assignment are graded."
                : "No student work has been submitted yet."}
            </p>
          </div>
        ) : (
          <ul className={styles.assignmentList}>
            {visibleSubmissions.map((submission) => (
              <li key={submission.id} className={styles.assignmentItem}>
                <div className={styles.assignmentIcon}>🧑‍🎓</div>
                <div className={styles.assignmentInfo}>
                  <span className={styles.assignmentTitle}>{submission.studentEmail}</span>
                  <span className={styles.assignmentDesc}>{submission.answer}</span>
                  {submission.autoScore != null &&
                    submission.autoMaxScore != null &&
                    submission.autoMaxScore > 0 && (
                    <span className={styles.autoLine}>
                      Auto (objective): {submission.autoScore}/{submission.autoMaxScore} pts
                    </span>
                  )}
                  <div className={styles.gradeRow}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Score /100"
                      className={styles.input}
                      value={gradeScores[submission.id] ?? submission.grade ?? ""}
                      onChange={(e) =>
                        setGradeScores((prev) => ({ ...prev, [submission.id]: e.target.value }))
                      }
                    />
                    <div className={styles.feedbackBlock}>
                      <div className={styles.templateRow}>
                        {FEEDBACK_TEMPLATES.map((text) => (
                          <button
                            key={text}
                            type="button"
                            className={styles.templateChip}
                            onClick={() => applyFeedbackTemplate(submission.id, text)}
                          >
                            {text}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Feedback (optional)"
                        className={styles.input}
                        value={gradeFeedback[submission.id] ?? submission.feedback ?? ""}
                        onChange={(e) =>
                          setGradeFeedback((prev) => ({ ...prev, [submission.id]: e.target.value }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.postBtn}
                      onClick={() => handleSaveGrade(submission.id)}
                    >
                      Save Grade
                    </button>
                    <button
                      type="button"
                      className={styles.returnBtn}
                      onClick={() => handleReturn(submission.id)}
                    >
                      Return for revision
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {gradingMessage && (
          <p className={`${styles.message} ${gradingType === "success" ? styles.msgSuccess : styles.msgError}`}>
            {gradingType === "success" ? "✅ " : "❌ "}
            {gradingMessage}
          </p>
        )}
        </div>
      </section>
      )}

    </div>
  );
}

export default AssignmentPanel;