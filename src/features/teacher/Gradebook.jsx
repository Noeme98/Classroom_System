import { useMemo } from "react";
import { buildGradebook, exportGradebookCsv } from "./gradebookUtils";
import styles from "./Gradebook.module.css";

function Gradebook({ classes, selectedClassId, onSelectClass }) {
  const activeClass = classes.find((c) => String(c.id) === String(selectedClassId));
  const { assignments, rows } = useMemo(
    () => (selectedClassId ? buildGradebook(selectedClassId) : { assignments: [], rows: [] }),
    [selectedClassId, classes]
  );

  if (!classes.length) {
    return <p className={styles.empty}>Create a subject first to use the gradebook.</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <select
          className={styles.select}
          value={selectedClassId ?? ""}
          onChange={(e) => onSelectClass(e.target.value)}
          aria-label="Select class"
        >
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.exportBtn}
          disabled={!selectedClassId || assignments.length === 0}
          onClick={() => exportGradebookCsv(selectedClassId, activeClass?.name || "gradebook")}
        >
          Export CSV
        </button>
      </div>

      {!selectedClassId ? (
        <p className={styles.empty}>Select a class.</p>
      ) : assignments.length === 0 ? (
        <p className={styles.empty}>No assignments in this class yet.</p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>No enrolled students in this class.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.stickyCol}>Student</th>
                {assignments.map((a) => (
                  <th key={a.id} title={a.title}>
                    <span className={styles.colTitle}>{a.title}</span>
                  </th>
                ))}
                <th>Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email}>
                  <td className={styles.stickyCol}>
                    <span className={styles.studentName}>{row.name}</span>
                    <span className={styles.studentEmail}>{row.email}</span>
                  </td>
                  {assignments.map((a) => {
                    const g = row.grades[a.id];
                    return (
                      <td key={a.id} className={g == null ? styles.missing : styles.grade}>
                        {g != null ? g : "—"}
                      </td>
                    );
                  })}
                  <td className={styles.avg}>{row.average != null ? `${row.average}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Gradebook;
