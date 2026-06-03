import { useMemo } from "react";
import { getAssignmentsByClass } from "./assignmentUtils";
import { getItem } from "../../utils/storage";
import { getLeaderboard } from "../system/xpUtils";
import styles from "./TeacherAnalytics.module.css";

function TeacherAnalytics({ classId, className = "Class" }) {
  const assignments = getAssignmentsByClass(classId);
  const submissions = (getItem("submissions") || []).filter(
    (entry) => String(entry.classId) === String(classId)
  );
  const classStudents = getItem("classStudents") || {};
  const roster = classStudents[String(classId)] || [];

  const byAssignment = useMemo(() => {
    const map = {};
    assignments.forEach((assignment) => {
      map[String(assignment.id)] = [];
    });
    submissions.forEach((submission) => {
      const key = String(submission.assignmentId);
      if (!map[key]) map[key] = [];
      map[key].push(submission);
    });
    return map;
  }, [assignments, submissions]);

  const totalExpected = assignments.length * roster.length;
  const totalSubmitted = submissions.length;
  const completionRate = totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 100) : 0;
  const gradedCount = submissions.filter((entry) => entry.grade != null).length;
  const pendingCount = submissions.filter((entry) => entry.grade == null).length;
  const returnedCount = submissions.filter((entry) => entry.returnedForRevision).length;

  const now = new Date();
  const lateCount = assignments.reduce((acc, assignment) => {
    const dueAt = new Date(`${assignment.dueDate}T23:59:59`);
    if (Number.isNaN(dueAt.getTime())) return acc;
    const assignmentSubs = byAssignment[String(assignment.id)] || [];
    const lateSubs = assignmentSubs.filter((entry) => new Date(entry.submittedAt) > dueAt).length;
    return acc + lateSubs;
  }, 0);

  const topPerformers = getLeaderboard(classId).slice(0, 5);
  const atRisk = roster
    .map((email) => {
      const studentSubs = submissions.filter((entry) => entry.studentEmail === email);
      const submittedIds = new Set(studentSubs.map((entry) => String(entry.assignmentId)));
      const missing = Math.max(assignments.length - submittedIds.size, 0);
      const latestGrades = studentSubs
        .map((entry) => Number(entry.grade))
        .filter((grade) => Number.isFinite(grade));
      const avgGrade = latestGrades.length
        ? Math.round(latestGrades.reduce((sum, grade) => sum + grade, 0) / latestGrades.length)
        : null;
      return { email, missing, avgGrade };
    })
    .filter((entry) => entry.missing > 0 || (entry.avgGrade != null && entry.avgGrade < 75))
    .sort((a, b) => b.missing - a.missing || (a.avgGrade ?? 999) - (b.avgGrade ?? 999))
    .slice(0, 8);

  const upcoming = assignments
    .map((assignment) => {
      const dueAt = new Date(`${assignment.dueDate}T23:59:59`);
      const diffDays = Math.ceil((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const submittedIds = new Set(
        (byAssignment[String(assignment.id)] || []).map((entry) => entry.studentEmail)
      );
      const missing = Math.max(roster.length - submittedIds.size, 0);
      return { assignment, diffDays, missing };
    })
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, 6);

  return (
    <section className={styles.analyticsWrap}>
      <header className={styles.analyticsHead}>
        <h2>Class analytics</h2>
        <p>{className} performance snapshot based on assignments, submissions, and grades.</p>
      </header>

      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Completion Rate</span>
          <span className={styles.statValue}>{completionRate}%</span>
          <span className={styles.statSub}>{totalSubmitted}/{totalExpected || 0} expected submissions</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Pending Grading</span>
          <span className={styles.statValue}>{pendingCount}</span>
          <span className={styles.statSub}>{gradedCount} graded so far</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Late Submissions</span>
          <span className={styles.statValue}>{lateCount}</span>
          <span className={styles.statSub}>{returnedCount} currently returned for revision</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Active Students</span>
          <span className={styles.statValue}>{roster.length}</span>
          <span className={styles.statSub}>{assignments.length} assignments posted</span>
        </article>
      </div>

      <div className={styles.grid2}>
        <article className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Top performers</h3>
            <span className={styles.cardBadge}>XP leaderboard</span>
          </div>
          {topPerformers.length === 0 ? (
            <p className={styles.empty}>No XP data yet.</p>
          ) : (
            <ul className={styles.rankList}>
              {topPerformers.map((entry, index) => (
                <li key={entry.email} className={styles.rankItem}>
                  <span className={styles.rankNo}>#{index + 1}</span>
                  <span className={styles.rankName}>{entry.email}</span>
                  <span className={styles.rankXP}>{entry.xp} XP</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <h3>At-risk students</h3>
            <span className={styles.cardBadge}>Needs attention</span>
          </div>
          {atRisk.length === 0 ? (
            <p className={styles.empty}>No at-risk students right now.</p>
          ) : (
            <ul className={styles.riskList}>
              {atRisk.map((entry) => (
                <li key={entry.email} className={styles.riskItem}>
                  <span className={styles.rankName}>{entry.email}</span>
                  <span className={styles.riskMeta}>
                    {entry.missing} missing · Avg: {entry.avgGrade == null ? "N/A" : `${entry.avgGrade}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className={styles.card}>
        <div className={styles.cardHead}>
          <h3>Upcoming deadlines</h3>
          <span className={styles.cardBadge}>Submission coverage</span>
        </div>
        {upcoming.length === 0 ? (
          <p className={styles.empty}>No assignment deadlines yet.</p>
        ) : (
          <ul className={styles.deadlineList}>
            {upcoming.map((row) => (
              <li key={row.assignment.id} className={styles.deadlineItem}>
                <span className={styles.rankName}>{row.assignment.title}</span>
                <span className={styles.deadlineMeta}>
                  {row.diffDays < 0
                    ? `Overdue by ${Math.abs(row.diffDays)}d`
                    : row.diffDays === 0
                      ? "Due today"
                      : `${row.diffDays}d left`}
                </span>
                <span className={styles.deadlineMissing}>{row.missing} missing</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

export default TeacherAnalytics;
