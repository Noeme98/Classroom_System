import { getQuizItems } from "./quizTypes";
import styles from "./StudentQuizForm.module.css";

function StudentQuizForm({ assignment, value, onChange }) {
  const items = getQuizItems(assignment);

  const setVal = (id, v) => {
    onChange({ ...value, [id]: v });
  };

  const toggleMulti = (qid, optId, checked) => {
    const cur = Array.isArray(value[qid]) ? [...value[qid]] : [];
    if (checked) {
      if (!cur.includes(optId)) cur.push(optId);
    } else {
      const i = cur.indexOf(optId);
      if (i >= 0) cur.splice(i, 1);
    }
    setVal(qid, cur);
  };

  return (
    <div className={styles.wrap}>
      {items.map((q) => (
        <div key={q.id} className={styles.block}>
          <p className={styles.prompt}>
            <span className={styles.pts}>{q.points} pts</span> {q.prompt}
          </p>

          {q.type === "mcq" && (
            <div className={styles.opts}>
              {(q.options || []).map((opt) => (
                <label key={opt.id} className={styles.radioLbl}>
                  <input
                    type="radio"
                    name={`mcq-${q.id}`}
                    checked={value[q.id] === opt.id}
                    onChange={() => setVal(q.id, opt.id)}
                  />
                  <span>{opt.label || opt.id}</span>
                </label>
              ))}
            </div>
          )}

          {q.type === "true_false" && (
            <div className={styles.opts}>
              <label className={styles.radioLbl}>
                <input
                  type="radio"
                  name={`tf-${q.id}`}
                  checked={value[q.id] === true}
                  onChange={() => setVal(q.id, true)}
                />
                <span>True</span>
              </label>
              <label className={styles.radioLbl}>
                <input
                  type="radio"
                  name={`tf-${q.id}`}
                  checked={value[q.id] === false}
                  onChange={() => setVal(q.id, false)}
                />
                <span>False</span>
              </label>
            </div>
          )}

          {q.type === "identification" && (
            <input
              type="text"
              className={styles.input}
              value={value[q.id] ?? ""}
              onChange={(e) => setVal(q.id, e.target.value)}
              placeholder="Your answer"
            />
          )}

          {q.type === "multi_select" && (
            <div className={styles.opts}>
              {(q.options || []).map((opt) => (
                <label key={opt.id} className={styles.radioLbl}>
                  <input
                    type="checkbox"
                    checked={(value[q.id] || []).includes(opt.id)}
                    onChange={(e) => toggleMulti(q.id, opt.id, e.target.checked)}
                  />
                  <span>{opt.label || opt.id}</span>
                </label>
              ))}
            </div>
          )}

          {q.type === "essay" && (
            <textarea
              className={styles.ta}
              rows={5}
              value={value[q.id] ?? ""}
              onChange={(e) => setVal(q.id, e.target.value)}
              placeholder="Write your response…"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default StudentQuizForm;
