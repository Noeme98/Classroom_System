import { getAssignmentsByClass } from "../teacher/assignmentUtils";
import { getXP, getXPLevelProgress } from "../system/xpUtils";
import { getSubmission } from "./submissionUtils";
import styles from "./StudentProgress.module.css";

function StudentProgress({ classId, studentEmail, className, onOpenAssignment }) {
  const assignments = getAssignmentsByClass(classId).sort(
    (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
  );
  const total = assignments.length;
  const xp = getXP(studentEmail, classId);
  const { level, into, need, pct } = getXPLevelProgress(xp);

  let submitted = 0;
  let graded = 0;
  let gradeSum = 0;
  let nextUp = null;

  assignments.forEach((assignment) => {
    const sub = getSubmission(assignment.id, studentEmail);
    if (sub && !sub.returnedForRevision) submitted += 1;
    if (sub?.grade != null && Number.isFinite(Number(sub.grade))) {
      graded += 1;
      gradeSum += Number(sub.grade);
    }
    if (!nextUp && (!sub || sub.returnedForRevision)) {
      nextUp = assignment;
    }
  });

  const average = graded > 0 ? (gradeSum / graded).toFixed(1) : null;
  const pending = Math.max(total - submitted, 0);
  const progressPct = total > 0 ? Math.round((submitted / total) * 100) : 0;

  return (
    <div className={styles.wrap}>
      <section className={styles.xpBanner}>
        <div className={styles.xpAvatar}>{className.slice(0, 2).toUpperCase()}</div>
        <div className={styles.xpInfo}>
          <div className={styles.xpName}>{className}</div>
          <div className={styles.xpMeta}>
            {submitted}/{total} submitted · {graded} graded
          </div>
          <div className={styles.xpTrack}>
            <div className={styles.xpFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.xpCount}>
            {into.toLocaleString()} / {need.toLocaleString()} XP to Level {level + 1} · {xp} XP total
          </div>
        </div>
        <div className={styles.xpBadge}>
          <i className="ti ti-bolt" aria-hidden="true" />
          Level {level}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            <i className="ti ti-chart-dots" aria-hidden="true" />
            Your progress
          </h2>
        </div>
        <div className={styles.body}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{submitted}/{total}</span>
              <span className={styles.statLabel}>Submitted</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{pending}</span>
              <span className={styles.statLabel}>Pending</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{average ?? "—"}</span>
              <span className={styles.statLabel}>Avg grade</span>
            </div>
          </div>
          {nextUp ? (
            <button
              type="button"
              className={styles.nextUp}
              onClick={() => onOpenAssignment?.(nextUp.id)}
            >
              <span className={styles.nextLabel}>Up next — tap to open</span>
              <strong>{nextUp.title}</strong>
              <span className={styles.nextDue}>
                Due{" "}
                {new Date(nextUp.dueDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
          ) : total > 0 ? (
            <p className={styles.allDone}>You&apos;re caught up on all assignments in this class.</p>
          ) : (
            <p className={styles.allDone}>No assignments posted yet. Check announcements for updates.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default StudentProgress;
