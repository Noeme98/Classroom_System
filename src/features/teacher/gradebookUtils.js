import { getItem } from "../../utils/storage";
import { getAssignmentsByClass } from "./assignmentUtils";
import { getSubmissions } from "../student/submissionUtils";

export function buildGradebook(classId) {
  const assignments = getAssignmentsByClass(classId).sort(
    (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
  );
  const classStudents = getItem("classStudents") || {};
  const students = getItem("students") || [];
  const emails = classStudents[String(classId)] || [];
  const allSubmissions = getSubmissions().filter((s) => String(s.classId) === String(classId));

  const rows = emails.map((email) => {
    const student = students.find((s) => s.email === email) || { email, name: email };
    const grades = {};
    const numeric = [];

    assignments.forEach((assignment) => {
      const sub = allSubmissions.find(
        (s) => s.assignmentId === assignment.id && s.studentEmail === email
      );
      const grade = sub?.grade != null && Number.isFinite(Number(sub.grade)) ? Number(sub.grade) : null;
      grades[assignment.id] = grade;
      if (grade != null) numeric.push(grade);
    });

    const average =
      numeric.length > 0
        ? (numeric.reduce((sum, g) => sum + g, 0) / numeric.length).toFixed(1)
        : null;

    return {
      email,
      name: student.name || email,
      grades,
      average,
    };
  });

  return { assignments, rows };
}

export function exportGradebookCsv(classId, className = "class") {
  const { assignments, rows } = buildGradebook(classId);
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = ["Student", "Email", ...assignments.map((a) => a.title), "Average"];
  const lines = [header.map(escape).join(",")];

  rows.forEach((row) => {
    lines.push(
      [
        row.name,
        row.email,
        ...assignments.map((a) => {
          const g = row.grades[a.id];
          return g != null ? g : "";
        }),
        row.average ?? "",
      ]
        .map(escape)
        .join(",")
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${className.replace(/\s+/g, "_")}_gradebook.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
