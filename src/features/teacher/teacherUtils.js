import { getItem, setItem } from "../../utils/storage";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";

const CLASSES_KEY = "classes";
const ASSIGNMENTS_KEY = "assignments";
const SUBMISSIONS_KEY = "submissions";
const JOINED_KEY = "joinedClasses";
const XP_KEY = "xpData";
const CLASS_STUDENTS_KEY = "classStudents";

// Generate a random 6-character join code
const generateCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const isDatabaseClassId = (id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(id)
  );

// Get all saved classes
export const getClasses = () => {
  return getItem(CLASSES_KEY) || [];
};

const getProfileIdByEmail = async (email) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

export const syncTeacherClasses = async (teacherEmail) => {
  if (!teacherEmail || !isSupabaseConfigured) return getClasses();
  try {
    const teacherId = await getProfileIdByEmail(teacherEmail);
    if (!teacherId) return getClasses();
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, code")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const classes = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      teacherEmail,
    }));
    setItem(CLASSES_KEY, classes);
    return classes;
  } catch {
    return isSupabaseConfigured ? [] : getClasses();
  }
};

// Create a new class and save it
export const createClass = async (className, teacherEmail = null) => {
  if (!className) return { success: false, message: "Please enter a class name." };

  if (isSupabaseConfigured) {
    if (!teacherEmail) {
      return { success: false, message: "You must be logged in to create a class." };
    }
    try {
      const teacherId = await getProfileIdByEmail(teacherEmail);
      if (!teacherId) {
        return { success: false, message: "Teacher profile not found in database." };
      }
      const payload = {
        teacher_id: teacherId,
        name: className,
        code: generateCode(),
      };
      const { data, error } = await supabase
        .from("classes")
        .insert(payload)
        .select("id, name, code")
        .single();
      if (error) throw error;
      const existing = getClasses();
      const newClass = { id: data.id, name: data.name, code: data.code, teacherEmail };
      const updated = [...existing, newClass];
      setItem(CLASSES_KEY, updated);
      const classStudents = getItem(CLASS_STUDENTS_KEY) || {};
      classStudents[String(newClass.id)] = classStudents[String(newClass.id)] || [];
      setItem(CLASS_STUDENTS_KEY, classStudents);
      return { success: true, classes: updated };
    } catch (err) {
      const message = String(err?.message || "");
      if (message.includes("classes") && message.includes("does not exist")) {
        return {
          success: false,
          message:
            "Database not set up. Run supabase/schema.sql in the Supabase SQL Editor, then try again.",
        };
      }
      return { success: false, message: message || "Failed to create class in database." };
    }
  }

  const existing = getClasses().filter((cls) => !isSupabaseConfigured || isDatabaseClassId(cls.id));
  const newClass = { id: Date.now(), name: className, code: generateCode(), teacherEmail: teacherEmail || null };
  const updated = [...existing, newClass];
  setItem(CLASSES_KEY, updated);
  return { success: true, classes: updated };
};

// Delete a class and clean up related data in other stores
export const deleteClass = async (classId) => {
  const classes = getClasses();
  const target = classes.find((cls) => String(cls.id) === String(classId));

  if (!target) {
    return { success: false, message: "Class not found." };
  }

  // Important: keep localStorage consistent by removing all class-linked records together.
  const updatedClasses = classes.filter((cls) => String(cls.id) !== String(classId));
  const assignments = (getItem(ASSIGNMENTS_KEY) || []).filter(
    (assignment) => String(assignment.classId) !== String(classId)
  );
  const submissions = (getItem(SUBMISSIONS_KEY) || []).filter(
    (submission) => String(submission.classId) !== String(classId)
  );
  const joinedClasses = (getItem(JOINED_KEY) || []).filter(
    (joined) => String(joined.id) !== String(classId)
  );

  const xpData = getItem(XP_KEY) || {};
  const cleanedXPData = Object.fromEntries(
    Object.entries(xpData).filter(([key]) => !key.endsWith(`_${String(classId)}`))
  );

  const classStudents = getItem(CLASS_STUDENTS_KEY) || {};
  const remainingClassStudents = { ...classStudents };
  delete remainingClassStudents[String(classId)];

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("classes").delete().eq("id", classId);
      if (error) throw error;
    } catch (err) {
      return { success: false, message: err.message || "Failed to delete class from database." };
    }
  }

  setItem(CLASSES_KEY, updatedClasses);
  setItem(ASSIGNMENTS_KEY, assignments);
  setItem(SUBMISSIONS_KEY, submissions);
  setItem(JOINED_KEY, joinedClasses);
  setItem(XP_KEY, cleanedXPData);
  setItem(CLASS_STUDENTS_KEY, remainingClassStudents);

  return { success: true, classes: updatedClasses, message: `Deleted ${target.name}.` };
};

/** Resolve the teacher email for a class (local cache or Supabase). */
export async function getTeacherEmailForClass(classId) {
  if (!classId) return null;
  const found = getClasses().find((c) => String(c.id) === String(classId));
  if (found?.teacherEmail) return found.teacherEmail;
  if (!isSupabaseConfigured) return null;
  try {
    const { data: cls, error: classError } = await supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", classId)
      .maybeSingle();
    if (classError) throw classError;
    if (!cls?.teacher_id) return null;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", cls.teacher_id)
      .maybeSingle();
    if (profileError) throw profileError;
    return profile?.email || null;
  } catch {
    return null;
  }
}