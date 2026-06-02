import { getItem, setItem } from "./storage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const CLASS_STUDENTS_KEY = "classStudents";
const STUDENTS_KEY = "students";

const toStudentName = (email, fullName) => {
  if (fullName && fullName.trim()) return fullName.trim();
  if (!email) return "Student";
  return email.split("@")[0];
};

export const syncClassRosters = async (classIds = []) => {
  if (!isSupabaseConfigured || !Array.isArray(classIds) || classIds.length === 0) {
    return getItem(CLASS_STUDENTS_KEY) || {};
  }

  const scopedClassIds = [...new Set(classIds.map(String))];
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("class_enrollments")
    .select("class_id, student_id")
    .in("class_id", scopedClassIds);
  if (enrollmentError) throw enrollmentError;

  const studentIds = [...new Set((enrollments || []).map((row) => row.student_id).filter(Boolean))];
  const profileById = {};
  if (studentIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", studentIds);
    if (profileError) throw profileError;
    (profiles || []).forEach((profile) => {
      profileById[profile.id] = profile;
    });
  }

  const currentMap = getItem(CLASS_STUDENTS_KEY) || {};
  const nextMap = { ...currentMap };
  scopedClassIds.forEach((id) => {
    nextMap[id] = [];
  });
  (enrollments || []).forEach((row) => {
    const classId = String(row.class_id);
    const email = profileById[row.student_id]?.email;
    if (!email) return;
    const existing = nextMap[classId] || [];
    if (!existing.includes(email)) {
      nextMap[classId] = [...existing, email];
    }
  });
  setItem(CLASS_STUDENTS_KEY, nextMap);

  const currentStudents = getItem(STUDENTS_KEY) || [];
  const byEmail = new Map(
    currentStudents
      .filter((student) => student?.email)
      .map((student) => [student.email, student])
  );
  Object.values(profileById).forEach((profile) => {
    const email = profile.email;
    if (!email) return;
    const existing = byEmail.get(email) || {};
    byEmail.set(email, {
      id: profile.id,
      email,
      name: toStudentName(email, profile.full_name),
      section: existing.section || "",
    });
  });
  setItem(STUDENTS_KEY, Array.from(byEmail.values()));

  return nextMap;
};
