import { getAssignmentsByClass } from "../teacher/assignmentUtils";
import { getSubmission } from "./submissionUtils";
import styles from "./StudentClassGrades.module.css";

function StudentClassGrades({ classId, studentEmail, onOpenAssignment }) {
  const assignments = getAssignmentsByClass(classId);
  const graded = assignments
    .map((assignment) => {
      const sub = getSubmission(assignment.id, studentEmail);
      if (sub?.grade == null || !Number.isFinite(Number(sub.grade))) return null;
      return { assignment, sub };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.sub.gradedAt || 0) - new Date(a.sub.gradedAt || 0));

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <i className="ti ti-report-analytics" aria-hidden="true" />
          Your grades
        </h2>
        <span className={styles.badge}>{graded.length}</span>
      </div>
      <div className={styles.body}>
        {graded.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <i className="ti ti-chart-bar" aria-hidden="true" />
            </div>
            <h4>No grades yet</h4>
            <p>Scores appear here after your teacher reviews your work.</p>
          </div>
        ) : (
          <ul className={styles.list}>
            {graded.map(({ assignment, sub }) => (
              <li key={assignment.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => onOpenAssignment?.(assignment.id)}
                >
                  <div className={styles.rowInfo}>
                    <span className={styles.rowTitle}>{assignment.title}</span>
                    {sub.feedback ? (
                      <span className={styles.rowFeedback}>{sub.feedback}</span>
                    ) : (
                      <span className={styles.rowMeta}>Tap to view assignment</span>
                    )}
                  </div>
                  <span className={styles.score}>{sub.grade}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default StudentClassGrades;
