import { getItem } from "../../utils/storage";
import { getAssignmentsByClass } from "./assignmentUtils";
import { getSubmissions } from "../student/submissionUtils";
import styles from "./ClassRoster.module.css";

function ClassRoster({ classId, onExportGrades, exportDisabled = false, layout = "default" }) {
  const classStudents = getItem("classStudents") || {};
  const students = getItem("students") || [];
  const emails = classStudents[String(classId)] || [];
  const assignments = getAssignmentsByClass(classId);
  const submissions = getSubmissions().filter((s) => String(s.classId) === String(classId));
  const page = layout === "page";

  if (emails.length === 0) {
    return (
      <section className={styles.card}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            <i className="ti ti-users" aria-hidden="true" />
            Class roster
          </h2>
        </div>
        <div className={styles.emptyBody}>
          <div className={styles.emptyIcon}>
            <i className="ti ti-users" aria-hidden="true" />
          </div>
          <h4>No students enrolled</h4>
          <p>Share the join code from the header so students can join.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <i className="ti ti-users" aria-hidden="true" />
          Class roster
        </h2>
        <div className={styles.headRight}>
          <span className={styles.countBadge}>{emails.length} student{emails.length === 1 ? "" : "s"}</span>
          {onExportGrades && (
            <button
              type="button"
              className={styles.exportBtn}
              disabled={exportDisabled}
              onClick={onExportGrades}
            >
              <i className="ti ti-download" aria-hidden="true" />
              Export CSV
            </button>
          )}
        </div>
      </div>
      <ul className={`${styles.list} ${page ? styles.listPage : ""}`}>
        {emails.map((email) => {
          const student = students.find((s) => s.email === email);
          const studentSubs = submissions.filter((s) => s.studentEmail === email);
          const submittedCount = studentSubs.filter((s) => !s.returnedForRevision).length;
          const graded = studentSubs.filter((s) => s.grade != null).length;
          const missing = Math.max(assignments.length - submittedCount, 0);

          return (
            <li key={email} className={styles.row}>
              <div className={styles.rosterLeft}>
                <div className={styles.avatar}>{(student?.name || email).slice(0, 2).toUpperCase()}</div>
                <div className={styles.info}>
                  <span className={styles.name}>{student?.name || email}</span>
                  <span className={styles.email}>{email}</span>
                </div>
              </div>
              <div className={styles.stats}>
                <span className={styles.statBadge}>{graded} graded</span>
                {missing > 0 && <span className={styles.statWarn}>{missing} not submitted</span>}
                {missing === 0 && assignments.length > 0 && (
                  <span className={styles.statMuted}>
                    {submittedCount}/{assignments.length} in
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ClassRoster;
