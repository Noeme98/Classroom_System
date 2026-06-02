import { getItem, setItem } from "./storage";
import { notifyUsers } from "./notificationUtils";
import { getJoinedClasses } from "../features/student/studentUtils";
import { getClasses } from "../features/teacher/teacherUtils";

const REMINDER_KEY = "dueReminderSent";

const reminderKey = (assignmentId, email) => `${assignmentId}_${email}`;

const hoursUntilDue = (dueDate) => {
  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  return (due.getTime() - Date.now()) / (1000 * 60 * 60);
};

/** Notify students about assignments due within 48h (once per assignment). */
export function syncDueDateReminders(user) {
  if (!user?.email || user.role !== "student") return;

  const assignments = getItem("assignments") || [];
  const submissions = getItem("submissions") || [];
  const joined = getJoinedClasses();
  const joinedIds = new Set(joined.map((c) => String(c.id)));
  const sent = { ...(getItem(REMINDER_KEY) || {}) };
  let changed = false;

  assignments.forEach((assignment) => {
    if (!joinedIds.has(String(assignment.classId))) return;

    const hours = hoursUntilDue(assignment.dueDate);
    if (hours == null || hours > 48 || hours < -24) return;

    const done = submissions.some(
      (s) =>
        String(s.assignmentId) === String(assignment.id) &&
        s.studentEmail === user.email &&
        !s.returnedForRevision
    );
    if (done) return;

    const key = reminderKey(assignment.id, user.email);
    if (sent[key]) return;

    const clsName = joined.find((c) => String(c.id) === String(assignment.classId))?.name || "Class";
    const dueLabel =
      hours < 0
        ? "This assignment is overdue"
        : hours <= 24
          ? "Due within 24 hours"
          : "Due within 2 days";

    notifyUsers({
      recipientEmails: [user.email],
      title: dueLabel,
      body: `${assignment.title} (${clsName}) — open the class to submit.`,
      type: "assignment",
      meta: { classId: assignment.classId, assignmentId: assignment.id },
    });

    sent[key] = Date.now();
    changed = true;
  });

  if (changed) setItem(REMINDER_KEY, sent);
}

/** Remind teachers about ungraded submissions (once per day per class). */
export function syncTeacherGradingReminders(user) {
  if (!user?.email || user.role !== "teacher") return;

  const classes = getClasses();
  const submissions = getItem("submissions") || [];
  const sent = { ...(getItem(REMINDER_KEY) || {}) };
  let changed = false;

  classes.forEach((cls) => {
    const pendingSubs = submissions.filter(
      (s) => String(s.classId) === String(cls.id) && s.grade === null
    );
    const pending = pendingSubs.length;
    if (pending === 0) return;

    const key = `teacher_grade_${cls.id}_${user.email}`;
    const last = sent[key];
    if (last && Date.now() - last < 24 * 60 * 60 * 1000) return;

    const firstPending = pendingSubs[0];

    notifyUsers({
      recipientEmails: [user.email],
      title: "Submissions to review",
      body: `${pending} submission${pending === 1 ? "" : "s"} waiting in ${cls.name}.`,
      type: "assignment",
      meta: {
        classId: cls.id,
        assignmentId: firstPending?.assignmentId || null,
      },
    });

    sent[key] = Date.now();
    changed = true;
  });

  if (changed) setItem(REMINDER_KEY, sent);
}
