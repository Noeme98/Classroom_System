import { newQuestionId } from "./quizTypes";
import styles from "./QuizBuilder.module.css";

const emptyMcq = () => ({
  id: newQuestionId(),
  type: "mcq",
  prompt: "",
  points: 1,
  options: [
    { id: "a", label: "" },
    { id: "b", label: "" },
  ],
  correctOptionId: "a",
});

const emptyTf = () => ({
  id: newQuestionId(),
  type: "true_false",
  prompt: "",
  points: 1,
  correctTrueFalse: true,
});

const emptyId = () => ({
  id: newQuestionId(),
  type: "identification",
  prompt: "",
  points: 1,
  acceptableAnswers: [""],
});

const emptyMulti = () => ({
  id: newQuestionId(),
  type: "multi_select",
  prompt: "",
  points: 2,
  options: [
    { id: "a", label: "" },
    { id: "b", label: "" },
    { id: "c", label: "" },
  ],
  correctOptionIds: ["a"],
});

const emptyEssay = () => ({
  id: newQuestionId(),
  type: "essay",
  prompt: "",
  points: 3,
});

function QuizBuilder({ items, onChange }) {
  const updateAt = (index, patch) => {
    const next = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    onChange(next);
  };

  const removeAt = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const add = (type) => {
    const factory = {
      mcq: emptyMcq,
      true_false: emptyTf,
      identification: emptyId,
      multi_select: emptyMulti,
      essay: emptyEssay,
    }[type];
    if (!factory) return;
    onChange([...items, factory()]);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Add question</span>
        {["mcq", "true_false", "identification", "multi_select", "essay"].map((t) => (
          <button key={t} type="button" className={styles.addChip} onClick={() => add(t)}>
            {t === "mcq"
              ? "+ Multiple choice"
              : t === "true_false"
                ? "+ True / False"
                : t === "identification"
                  ? "+ Identification"
                  : t === "multi_select"
                    ? "+ Multi-select"
                    : "+ Essay"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>No quiz items yet — add questions to auto-grade (essay is teacher-reviewed).</p>
      ) : (
        <ul className={styles.list}>
          {items.map((q, index) => (
            <li key={q.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.badge}>{q.type.replace("_", " ")}</span>
                <button type="button" className={styles.removeBtn} onClick={() => removeAt(index)}>
                  Remove
                </button>
              </div>

              <label className={styles.lbl}>Prompt</label>
              <textarea
                className={styles.ta}
                rows={2}
                value={q.prompt}
                onChange={(e) => updateAt(index, { prompt: e.target.value })}
                placeholder="Question text shown to students"
              />

              <div className={styles.row}>
                <label className={styles.lbl}>Points</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={styles.num}
                  value={q.points}
                  onChange={(e) => updateAt(index, { points: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>

              {q.type === "mcq" && (
                <div className={styles.opts}>
                  <span className={styles.lbl}>Options (select correct)</span>
                  {(q.options || []).map((opt, oi) => (
                    <div key={opt.id} className={styles.optRow}>
                      <input
                        type="radio"
                        name={`correct-${q.id}`}
                        checked={q.correctOptionId === opt.id}
                        onChange={() => updateAt(index, { correctOptionId: opt.id })}
                      />
                      <input
                        className={styles.input}
                        value={opt.label}
                        onChange={(e) => {
                          const options = (q.options || []).map((o, j) =>
                            j === oi ? { ...o, label: e.target.value } : o
                          );
                          updateAt(index, { options });
                        }}
                        placeholder={`Option ${opt.id}`}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => {
                      const nid = String.fromCharCode(97 + (q.options || []).length);
                      updateAt(index, { options: [...(q.options || []), { id: nid, label: "" }] });
                    }}
                  >
                    + Add option
                  </button>
                </div>
              )}

              {q.type === "true_false" && (
                <div className={styles.row}>
                  <span className={styles.lbl}>Correct answer</span>
                  <select
                    className={styles.select}
                    value={q.correctTrueFalse === false ? "false" : "true"}
                    onChange={(e) => updateAt(index, { correctTrueFalse: e.target.value === "true" })}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
              )}

              {q.type === "identification" && (
                <div className={styles.opts}>
                  <span className={styles.lbl}>Acceptable answers (any match)</span>
                  {(q.acceptableAnswers || [""]).map((ans, ai) => (
                    <input
                      key={ai}
                      className={styles.input}
                      value={ans}
                      onChange={(e) => {
                        const acceptableAnswers = [...(q.acceptableAnswers || [""])];
                        acceptableAnswers[ai] = e.target.value;
                        updateAt(index, { acceptableAnswers });
                      }}
                      placeholder="e.g. Paris"
                    />
                  ))}
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() =>
                      updateAt(index, { acceptableAnswers: [...(q.acceptableAnswers || [""]), ""] })
                    }
                  >
                    + Synonym / alternate
                  </button>
                </div>
              )}

              {q.type === "multi_select" && (
                <div className={styles.opts}>
                  <span className={styles.lbl}>Options — check all correct answers below</span>
                  {(q.options || []).map((opt, oi) => (
                    <div key={opt.id} className={styles.optRow}>
                      <input
                        type="checkbox"
                        checked={(q.correctOptionIds || []).includes(opt.id)}
                        onChange={(e) => {
                          const set = new Set(q.correctOptionIds || []);
                          if (e.target.checked) set.add(opt.id);
                          else set.delete(opt.id);
                          updateAt(index, { correctOptionIds: [...set] });
                        }}
                      />
                      <input
                        className={styles.input}
                        value={opt.label}
                        onChange={(e) => {
                          const options = (q.options || []).map((o, j) =>
                            j === oi ? { ...o, label: e.target.value } : o
                          );
                          updateAt(index, { options });
                        }}
                        placeholder={`Option ${opt.id}`}
                      />
                    </div>
                  ))}
                  <p className={styles.hint}>Students must select exactly the set you marked correct.</p>
                </div>
              )}

              {q.type === "essay" && (
                <p className={styles.hint}>Essays are not auto-scored; you grade them with the score / feedback fields.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default QuizBuilder;
