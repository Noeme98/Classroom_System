import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJoinedClasses, joinClass, syncAllClasses, syncJoinedClasses } from "./studentUtils";
import { syncAssignmentsByClass } from "../teacher/assignmentUtils";
import { syncSubmissionsByClass } from "./submissionUtils";
import styles from "./StudentView.module.css";
import { getXP, syncXPByClass } from "../system/xpUtils";
import { useAuth } from "../../contexts/useAuth";
import { getItem } from "../../utils/storage";
import { syncClassRosters } from "../../utils/rosterSync";
import { buildClassUrl } from "../../utils/classNavigation";

function StudentView({ section = "overview" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  // Important: initialize from storage once; avoids unnecessary effect-based state updates.
  const [joinedClasses, setJoinedClasses] = useState([]);
  const [enrollmentsLoaded, setEnrollmentsLoaded] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // "success" or "error"
  const [joining, setJoining] = useState(false);
  const assignments = getItem("assignments") || [];
  const submissions = getItem("submissions") || [];
  const classStudents = getItem("classStudents") || {};
  const totalXP = joinedClasses.reduce((sum, cls) => sum + getXP(user.email, cls.id), 0);
  const totalAssignments = joinedClasses.reduce(
    (count, cls) =>
      count + assignments.filter((assignment) => String(assignment.classId) === String(cls.id)).length,
    0
  );
  const submittedCount = submissions.filter(
    (submission) =>
      submission.studentEmail === user.email &&
      joinedClasses.some((cls) => String(cls.id) === String(submission.classId))
  ).length;
  const pendingAssignments = Math.max(totalAssignments - submittedCount, 0);
  const dueSoonCount = assignments.filter((assignment) => {
    const inJoinedClass = joinedClasses.some((cls) => String(cls.id) === String(assignment.classId));
    if (!inJoinedClass) return false;
    const due = new Date(assignment.dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  const sortedStudentAssignments = assignments
    .filter((assignment) => joinedClasses.some((cls) => String(cls.id) === String(assignment.classId)))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const gradedWork = submissions
    .filter(
      (s) =>
        s.studentEmail === user.email &&
        s.grade !== null &&
        joinedClasses.some((cls) => String(cls.id) === String(s.classId))
    )
    .sort((a, b) => new Date(b.submittedAt ?? 0) - new Date(a.submittedAt ?? 0));

  const handleJoin = async () => {
    setJoining(true);
    const result = await joinClass(joinCode, user.email);
    setJoining(false);
    setMessage(result.message);
    setMessageType(result.success ? "success" : "error");

    if (result.success) {
      setJoinedClasses(result.classes);
      // Important: auto-focus the newly joined class so student can start immediately.
      const latestClass = result.classes[result.classes.length - 1];
      setSelectedClassId(latestClass?.id ?? null);
      setJoinCode("");
    }
  };

  useEffect(() => {
    const raw = sessionStorage.getItem("classroomDashboardFocus");
    if (!raw) return;
    try {
      const focus = JSON.parse(raw);
      sessionStorage.removeItem("classroomDashboardFocus");
      if (focus.classId) {
        navigate(buildClassUrl(focus.classId, focus.assignmentId));
      }
    } catch {
      /* ignore */
    }
  }, [navigate]);

  useEffect(() => {
    const run = async () => {
      await syncAllClasses();
      const synced = await syncJoinedClasses(user.email);
      if (Array.isArray(synced)) {
        setJoinedClasses(synced);
        setSelectedClassId((prev) => prev ?? synced[0]?.id ?? null);
      }
      setEnrollmentsLoaded(true);
    };
    run();
  }, [user.email]);

  useEffect(() => {
    const run = async () => {
      if (!enrollmentsLoaded || !joinedClasses.length) return;
      await Promise.all(
        joinedClasses.flatMap((cls) => [
          syncAssignmentsByClass(cls.id),
          syncSubmissionsByClass(cls.id),
          syncXPByClass(cls.id),
        ])
      );
      await syncClassRosters(joinedClasses.map((cls) => cls.id));
    };
    run();
  }, [joinedClasses, enrollmentsLoaded]);

  const displayName = user?.fullName?.trim() || user.email.split("@")[0];

  const openClassAssignment = (classId, assignmentId) => {
    navigate(buildClassUrl(classId, assignmentId));
  };

  const renderAssignmentList = (items) => {
    if (items.length === 0) {
      return <p className={styles.emptyText}>No assignments yet. Open a class to submit work.</p>;
    }
    return (
      <ul className={styles.assignmentList}>
        {items.map((assignment) => {
          const due = new Date(assignment.dueDate);
          const now = new Date();
          const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const dueStatus =
            diffDays < 0 ? styles.dueLate : diffDays <= 1 ? styles.dueSoon : styles.dueOk;
          const subjName =
            joinedClasses.find((cls) => String(cls.id) === String(assignment.classId))?.name || "Class";
          const hasSubmitted = submissions.some(
            (submission) =>
              String(submission.assignmentId) === String(assignment.id) && submission.studentEmail === user.email
          );
          const completionPercent = hasSubmitted ? 100 : 0;
          return (
            <li key={assignment.id} className={styles.assignmentItem}>
              <button
                type="button"
                className={styles.assignmentLink}
                onClick={() => openClassAssignment(assignment.classId, assignment.id)}
              >
                <div className={styles.assignmentTop}>
                  <span className={styles.assignmentName}>{assignment.title}</span>
                  <div className={styles.statusPills}>
                    <span className={`${styles.duePill} ${dueStatus}`}>
                      {diffDays < 0 ? "Overdue" : diffDays === 0 ? "Due today" : `${diffDays} days left`}
                    </span>
                    <span
                      className={
                        hasSubmitted ? styles.statusSubmitted : styles.statusPending
                      }
                    >
                      {hasSubmitted ? "Submitted" : "Pending"}
                    </span>
                  </div>
                </div>
                <span className={styles.assignmentMeta}>{subjName}</span>
                <div className={styles.assignmentProgress}>
                  <div className={styles.assignBarWrap}>
                    <div
                      className={styles.assignBar}
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  const classesCard = (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Your classes</h3>
        <span className={styles.cardAction}>Join class</span>
      </div>

      <div className={styles.joinRow}>
        <input
          type="text"
          placeholder="Paste code from teacher"
          value={joinCode}
          onChange={(e) =>
            setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
          className={`${styles.input} ${styles.codeInput}`}
          maxLength={8}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" onClick={handleJoin} className={styles.joinBtn} disabled={joining}>
          {joining ? "Joining..." : "Join"}
        </button>
      </div>
      <p className={styles.joinHint}>
        Click the purple code on your teacher&apos;s subject to copy it. Use digit <strong>0</strong>, not
        letter <strong>O</strong>.
      </p>

      {message && (
        <p className={`${styles.message} ${messageType === "success" ? styles.msgSuccess : styles.msgError}`}>
          {messageType === "success" ? "✅ " : "❌ "}
          {message}
        </p>
      )}

      {joinedClasses.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p>Join your first class to unlock assignments</p>
        </div>
      ) : (
        <ul className={styles.classList}>
          {joinedClasses.map((cls) => (
            <li
              key={cls.id}
              className={`${styles.classItem} ${
                String(selectedClassId) === String(cls.id) ? styles.classItemActive : ""
              }`}
            >
              <div className={`${styles.classIcon} ${styles.studentIcon}`}>📘</div>
              <div className={styles.classInfo}>
                <span className={styles.className}>{cls.name}</span>
                <span className={styles.classCode}>Code: {cls.code}</span>
                <span className={styles.classMeta}>
                  {(classStudents[String(cls.id)] || []).length} students in class
                </span>
              </div>
              <span className={styles.classXP}>{getXP(user.email, cls.id)} XP</span>
              <button type="button" className={styles.openBtn} onClick={() => navigate(buildClassUrl(cls.id))}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );

  const statsSection = (
    <section className={`${styles.statsGrid3} ${styles.statsAnimate}`}>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Due soon</span>
        <span className={styles.statValue}>{dueSoonCount}</span>
        <span className={styles.statSub}>{dueSoonCount > 0 ? "This week" : "No upcoming"}</span>
      </article>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Pending</span>
        <span className={styles.statValue}>{pendingAssignments}</span>
        <span className={styles.statSub}>To submit</span>
      </article>
      <article className={styles.statCard}>
        <span className={styles.statLabel}>Classes</span>
        <span className={styles.statValue}>{joinedClasses.length}</span>
        <span className={styles.statSub}>{totalXP} XP total</span>
      </article>
    </section>
  );

  return (
    <div className={styles.wrapper}>
      {section === "overview" && (
        <div className={styles.overviewAnimate}>
          <section className={styles.welcome}>
            <h2>Welcome back, {displayName} 👋</h2>
            <p>
              {pendingAssignments > 0
                ? `${pendingAssignments} assignment${pendingAssignments === 1 ? "" : "s"} still to submit`
                : "You're caught up — open a class to see new work"}
            </p>
          </section>
          {statsSection}
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>Your assignments</h3>
              <span className={styles.sortBadge}>
                <i className="ti ti-arrows-sort" aria-hidden="true" />
                By due date
              </span>
            </div>
            {renderAssignmentList(sortedStudentAssignments)}
          </article>
        </div>
      )}

      {section === "classes" && (
        <>
          <header className={styles.pageHeader}>
            <h3>My classes</h3>
            <p>Join with a code from your teacher and open a subject to work in.</p>
          </header>
          {classesCard}
        </>
      )}

      {section === "grades" && (
        <>
          <header className={styles.pageHeader}>
            <h3>My grades</h3>
            <p>Scores your teachers have posted.</p>
          </header>
          <article className={styles.card}>
            {gradedWork.length === 0 ? (
              <p className={styles.emptyText}>No graded work yet.</p>
            ) : (
              <ul className={styles.reviewList}>
                {gradedWork.map((sub) => {
                  const assignment = assignments.find((a) => String(a.id) === String(sub.assignmentId));
                  const clsName =
                    joinedClasses.find((c) => String(c.id) === String(sub.classId))?.name || "Class";
                  return (
                    <li key={sub.id} className={styles.gradeRow}>
                      <button
                        type="button"
                        className={styles.gradeLink}
                        onClick={() => openClassAssignment(sub.classId, sub.assignmentId)}
                      >
                        <span className={styles.gradeTitle}>{assignment?.title || "Assignment"}</span>
                        <span className={styles.gradeMeta}>{clsName}</span>
                      </button>
                      <span className={styles.gradeScore}>{sub.grade}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </>
      )}
    </div>
  );
}

export default StudentView;
