import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getClasses, createClass, deleteClass, syncTeacherClasses } from "./teacherUtils";
import { syncAssignmentsByClass } from "./assignmentUtils";
import { syncSubmissionsByClass } from "../student/submissionUtils";
import { getItem } from "../../utils/storage";
import { syncXPByClass } from "../system/xpUtils";
import { useAuth } from "../../contexts/useAuth";
import { syncClassRosters } from "../../utils/rosterSync";
import { buildClassUrl } from "../../utils/classNavigation";
import { copyToClipboard } from "../../utils/copyToClipboard";
import styles from "./TeacherView.module.css";

function TeacherView({ section = "overview" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [className, setClassName] = useState("");
  // Important: boot from storage once so class list survives refresh.
  const [classes, setClasses] = useState(() => getClasses());
  const [selectedClassId, setSelectedClassId] = useState(() => {
    const initial = getClasses();
    return initial.length > 0 ? initial[0].id : null;
  });
  const [message, setMessage] = useState("");
  const [subjectsManageMode, setSubjectsManageMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const classStudents = getItem("classStudents") || {};
  const assignments = getItem("assignments") || [];
  const submissions = getItem("submissions") || [];
  const totalStudents = classes.reduce(
    (count, cls) => count + (classStudents[String(cls.id)] || []).length,
    0
  );
  const totalAssignments = classes.reduce(
    (count, cls) =>
      count + assignments.filter((assignment) => String(assignment.classId) === String(cls.id)).length,
    0
  );
  const pendingReviews = submissions.filter(
    (submission) =>
      classes.some((cls) => String(cls.id) === String(submission.classId)) &&
      submission.grade === null
  );

  const deadlineRows = [...assignments]
    .filter((assignment) => classes.some((cls) => String(cls.id) === String(assignment.classId)))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 4)
    .map((assignment) => {
      const classRoster = classStudents[String(assignment.classId)] || [];
      const assignmentSubs = submissions.filter((entry) => String(entry.assignmentId) === String(assignment.id));
      const submittedCountForAssignment = assignmentSubs.length;
      const dueDate = new Date(assignment.dueDate);
      const now = new Date();
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const dueStatus =
        diffDays < 0
          ? { label: "Overdue", className: styles.dueLate }
          : diffDays === 0
            ? { label: "Due today", className: styles.dueSoon }
            : { label: `${diffDays} days left`, className: styles.dueOk };
      return {
        assignment,
        submittedCountForAssignment,
        classRosterCount: classRoster.length,
        dueStatus,
        missing: Math.max(classRoster.length - submittedCountForAssignment, 0),
      };
    });

  useEffect(() => {
    const run = async () => {
      if (!user?.email) return;
      const synced = await syncTeacherClasses(user.email);
      await Promise.all(
        synced.flatMap((cls) => [
          syncAssignmentsByClass(cls.id),
          syncSubmissionsByClass(cls.id),
          syncXPByClass(cls.id),
        ])
      );
      await syncClassRosters(synced.map((cls) => cls.id));
      setClasses(synced);
      setSelectedClassId((prev) => prev ?? synced[0]?.id ?? null);
    };
    run();
  }, [user?.email]);

  const handleCopyCode = async (code) => {
    const ok = await copyToClipboard(code);
    setCopyHint(ok ? "Join code copied!" : "Could not copy — select the code manually.");
    window.setTimeout(() => setCopyHint(""), 2200);
  };

  const openClassGrading = (classId, assignmentId) => {
    navigate(buildClassUrl(classId, assignmentId));
  };

  const handleCreateClass = async () => {
    setIsSaving(true);
    const result = await createClass(className, user?.email);
    setIsSaving(false);
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    setClasses(result.classes);
    // Important: focus newly created class so teacher can immediately manage it.
    const latestClass = result.classes[result.classes.length - 1];
    setSelectedClassId(latestClass?.id ?? null);
    setClassName("");
    setMessage("");
  };

  const handleDeleteClass = async (classId, className) => {
    const confirmed = window.confirm(
      `Permanently delete "${className}"?\n\nThis removes all assignments, submissions, enrollments, and leaderboard data. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    const result = await deleteClass(classId);
    setIsSaving(false);
    setMessage(result.message);
    if (!result.success) return;

    setClasses(result.classes);
    const nextSelected = result.classes.length > 0 ? result.classes[0].id : null;
    setSelectedClassId(nextSelected);
    if (result.classes.length === 0) setSubjectsManageMode(false);
  };

  const displayName = user?.fullName?.trim() || user?.email?.split("@")[0] || "Teacher";
  const greet =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 17
        ? "Good afternoon"
        : "Good evening";

  const statsSection = (
    <section className={styles.statsGrid}>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Subjects</span>
        <span className={styles.statValue}>{classes.length}</span>
        <span className={styles.statSub}>Active classes</span>
      </article>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Enrolled Students</span>
        <span className={styles.statValue}>{totalStudents}</span>
        <span className={styles.statSub}>Across all subjects</span>
      </article>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Assignments Posted</span>
        <span className={styles.statValue}>{totalAssignments}</span>
        <span className={styles.statSub}>Available for grading</span>
      </article>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Pending Reviews</span>
        <span className={styles.statValue}>{pendingReviews.length}</span>
        <span className={styles.statSub}>Needs feedback</span>
      </article>
    </section>
  );

  const submissionsReviewCard = (limit) => (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          <i className="ti ti-file-check" aria-hidden="true" />
          Submissions to review
        </h3>
        <span className={styles.cardAction}>Latest</span>
      </div>
      {pendingReviews.length === 0 ? (
        <p className={styles.emptyText}>No pending submissions right now.</p>
      ) : (
        <ul className={styles.reviewList}>
          {pendingReviews.slice(0, limit).map((submission) => {
            const assignment = assignments.find((a) => String(a.id) === String(submission.assignmentId));
            const cls = classes.find((c) => String(c.id) === String(submission.classId));
            return (
              <li key={submission.id} className={styles.reviewItem}>
                <div className={styles.reviewAvatar}>{submission.studentEmail.slice(0, 2).toUpperCase()}</div>
                <div className={styles.reviewInfo}>
                  <span className={styles.reviewName}>{submission.studentEmail}</span>
                  <span className={styles.reviewSub}>
                    {assignment?.title || "Assignment"} · {cls?.name || "Class"}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.openBtn}
                  onClick={() => {
                    openClassGrading(submission.classId, submission.assignmentId);
                  }}
                >
                  Grade
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );

  const deadlineCard = (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          <i className="ti ti-calendar-due" aria-hidden="true" />
          Deadline monitor
        </h3>
        <span className={styles.cardAction}>Upcoming</span>
      </div>
      {deadlineRows.length === 0 ? (
        <p className={styles.emptyText}>No assignment deadlines yet.</p>
      ) : (
        <ul className={styles.deadlineList}>
          {deadlineRows.map((row) => (
            <li key={row.assignment.id} className={styles.deadlineItem}>
              <button
                type="button"
                className={styles.deadlineBtn}
                onClick={() => openClassGrading(row.assignment.classId, row.assignment.id)}
              >
                <span
                  className={`${styles.deadlineBar} ${
                    row.dueStatus.label === "Overdue"
                      ? styles.deadlineDanger
                      : row.dueStatus.label === "Due today"
                        ? styles.deadlineWarn
                        : styles.deadlineSafe
                  }`}
                />
                <div className={styles.deadlineInfo}>
                  <span className={styles.deadlineName}>{row.assignment.title}</span>
                  <span className={styles.deadlineMeta}>
                    {classes.find((cls) => String(cls.id) === String(row.assignment.classId))?.name || "Class"} ·{" "}
                    {row.dueStatus.label}
                  </span>
                </div>
                <span className={styles.deadlineCount}>{row.missing} missing</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );

  const subjectsCard = (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          <i className="ti ti-books" aria-hidden="true" />
          Your subjects
        </h3>
        {classes.length > 0 && (
          <button
            type="button"
            className={`${styles.cardActionBtn} ${subjectsManageMode ? styles.cardActionBtnActive : ""}`}
            onClick={() => setSubjectsManageMode((prev) => !prev)}
          >
            {subjectsManageMode ? "Done" : "Manage"}
          </button>
        )}
      </div>
      <div className={styles.createRow}>
        <input
          type="text"
          placeholder="e.g. Mathematics, Science 101..."
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateClass()}
          className={styles.input}
        />
        <button type="button" onClick={handleCreateClass} className={styles.createBtn}>
          {isSaving ? "Saving..." : "Create"}
        </button>
      </div>

      {message && <p className={styles.errorMsg}>❌ {message}</p>}
      {copyHint && <p className={styles.copyHint}>{copyHint}</p>}

      {subjectsManageMode && classes.length > 0 && (
        <p className={styles.manageHint}>
          Manage mode: delete is enabled. Removing a subject permanently deletes its assignments and student data.
        </p>
      )}

      {classes.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🏫</span>
          <p>Create your first subject to get started</p>
        </div>
      ) : (
        <ul className={styles.classList}>
          {classes.map((cls) => (
            <li
              key={cls.id}
              className={`${styles.classItem} ${
                String(selectedClassId) === String(cls.id) ? styles.classItemActive : ""
              }`}
            >
              <div className={`${styles.classIcon} ${styles.teacherIcon}`}>📘</div>
              <div className={styles.classInfo}>
                <span className={styles.className}>{cls.name}</span>
                <span className={styles.classMeta}>{(classStudents[String(cls.id)] || []).length} students</span>
              </div>
              <button
                type="button"
                className={styles.codePill}
                title="Click to copy join code"
                onClick={() => handleCopyCode(cls.code)}
              >
                {cls.code}
              </button>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.openBtn}
                  onClick={() => {
                    setSelectedClassId(cls.id);
                    navigate(buildClassUrl(cls.id));
                  }}
                >
                  Open
                </button>
                {subjectsManageMode && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteClass(cls.id, cls.name)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );

  return (
    <div className={styles.wrapper}>
      {section === "overview" && (
        <>
          <section className={styles.welcome}>
            <h2>
              {greet}, {displayName} 👋
            </h2>
            <p>
              {pendingReviews.length} submissions pending review
              {classes.length > 0 ? ` · ${classes.length} active subjects` : ""}
            </p>
          </section>
          {statsSection}
          {message && <p className={styles.bannerMsg}>{message}</p>}
          <section className={styles.grid2}>
            {submissionsReviewCard(8)}
            {deadlineCard}
          </section>
        </>
      )}

      {section === "classes" && (
        <>
          <header className={styles.pageHeader}>
            <h3>My subjects</h3>
            <p>Create classes, share join codes, and open a subject workspace.</p>
          </header>
          {subjectsCard}
        </>
      )}

    </div>
  );
}

export default TeacherView;