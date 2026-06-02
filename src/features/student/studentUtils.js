import { getItem, setItem } from "../../utils/storage";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";

const CLASSES_KEY = "classes";
const JOINED_KEY = "joinedClasses";
const CLASS_STUDENTS_KEY = "classStudents";

// Get all available classes (created by teachers)
export const getAllClasses = () => {
  return getItem(CLASSES_KEY) || [];
};

// Get classes this student already joined
export const getJoinedClasses = () => {
  return getItem(JOINED_KEY) || [];
};

export const normalizeJoinCode = (code) => String(code || "").trim().toUpperCase();

/** Common mistypes: letter O vs digit 0. */
export const joinCodeLookupVariants = (code) => {
  const base = normalizeJoinCode(code);
  if (!base) return [];
  return [...new Set([base, base.replace(/O/g, "0"), base.replace(/0/g, "O")])];
};

const mapClassRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code,
});

const isMissingRpcError = (error, functionName) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42883" ||
    (message.includes("function") && message.includes(functionName.toLowerCase()))
  );
};

const INVALID_CODE_MESSAGE =
  "No class found for that code. Click your teacher's code to copy it (do not type it). Check O vs 0 — e.g. N1W20D uses zero, not letter O.";

const appendLocalEnrollment = (foundClass, studentEmail) => {
  const joinedClasses = getJoinedClasses();
  const updated = [...joinedClasses, foundClass];
  setItem(JOINED_KEY, updated);
  const classStudents = getItem(CLASS_STUDENTS_KEY) || {};
  const currentClassStudents = classStudents[String(foundClass.id)] || [];
  if (studentEmail && !currentClassStudents.includes(studentEmail)) {
    classStudents[String(foundClass.id)] = [...currentClassStudents, studentEmail];
    setItem(CLASS_STUDENTS_KEY, classStudents);
  }
  return updated;
};

/** Resolve a class by join code (used before enrollment). */
export const findClassByJoinCode = async (joinCode) => {
  const variants = joinCodeLookupVariants(joinCode);
  if (variants.length === 0) return null;

  if (isSupabaseConfigured) {
    for (const variant of variants) {
      const { data: rpcRows, error: rpcError } = await supabase.rpc("lookup_class_by_join_code", {
        p_code: variant,
      });
      if (!rpcError && rpcRows) {
        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        if (row) return mapClassRow(row);
      }
      if (rpcError && !isMissingRpcError(rpcError, "lookup_class_by_join_code")) {
        throw rpcError;
      }

      const { data, error } = await supabase
        .from("classes")
        .select("id, name, code")
        .eq("code", variant)
        .maybeSingle();
      if (error) throw error;
      if (data) return mapClassRow(data);
    }
    return null;
  }

  for (const variant of variants) {
    const found = getAllClasses().find((cls) => normalizeJoinCode(cls.code) === variant);
    if (found) return found;
  }
  return null;
};

const tryJoinClassRpc = async (codeVariant) => {
  const { data, error } = await supabase.rpc("join_class_by_code", { p_code: codeVariant });
  if (error && !isMissingRpcError(error, "join_class_by_code")) {
    throw error;
  }
  return data;
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

export const syncAllClasses = async () => {
  if (!isSupabaseConfigured) return getAllClasses();
  try {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, code")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const mapped = (data || []).map((row) => ({ id: row.id, name: row.name, code: row.code }));
    setItem(CLASSES_KEY, mapped);
    return mapped;
  } catch {
    return getAllClasses();
  }
};

export const syncJoinedClasses = async (studentEmail) => {
  if (!studentEmail || !isSupabaseConfigured) return getJoinedClasses();
  try {
    const studentId = await getProfileIdByEmail(studentEmail);
    if (!studentId) return getJoinedClasses();
    const { data, error } = await supabase
      .from("class_enrollments")
      .select("class_id")
      .eq("student_id", studentId);
    if (error) throw error;
    const classIds = (data || []).map((entry) => entry.class_id);
    if (classIds.length === 0) {
      setItem(JOINED_KEY, []);
      return [];
    }
    const { data: classes, error: classesError } = await supabase
      .from("classes")
      .select("id, name, code")
      .in("id", classIds);
    if (classesError) throw classesError;
    const mapped = (classes || []).map((row) => ({ id: row.id, name: row.name, code: row.code }));
    setItem(JOINED_KEY, mapped);
    return mapped;
  } catch {
    return getJoinedClasses();
  }
};

// Join a class by code
export const joinClass = async (joinCode, studentEmail = null) => {
  const variants = joinCodeLookupVariants(joinCode);
  if (variants.length === 0) {
    return { success: false, message: "Please enter a join code." };
  }

  if (isSupabaseConfigured && studentEmail) {
    try {
      for (const variant of variants) {
        const rpcResult = await tryJoinClassRpc(variant);
        if (rpcResult?.ok) {
          const foundClass = mapClassRow({
            id: rpcResult.id,
            name: rpcResult.name,
            code: rpcResult.code,
          });
          const updated = appendLocalEnrollment(foundClass, studentEmail);
          return {
            success: true,
            message: `Successfully joined ${foundClass.name}`,
            classes: updated,
          };
        }
        if (rpcResult?.error === "already_joined") {
          return {
            success: false,
            message: `You have already joined ${rpcResult.name || "this class"}.`,
          };
        }
      }

      const joinedClasses = getJoinedClasses();
      let foundClass = null;
      for (const variant of variants) {
        foundClass = await findClassByJoinCode(variant);
        if (foundClass) break;
      }

      if (!foundClass) {
        return { success: false, message: INVALID_CODE_MESSAGE };
      }

      const alreadyJoined = joinedClasses.some((cls) => String(cls.id) === String(foundClass.id));
      if (alreadyJoined) {
        return { success: false, message: "You have already joined this class." };
      }

      const studentId = await getProfileIdByEmail(studentEmail);
      if (!studentId) {
        return {
          success: false,
          message:
            "Your student profile is not in the database yet. Log out, log in again, then retry. If it persists, ask your teacher to confirm Supabase schema.sql was run.",
        };
      }

      const { error } = await supabase.from("class_enrollments").insert({
        class_id: foundClass.id,
        student_id: studentId,
      });
      if (error) throw error;

      const updated = appendLocalEnrollment(foundClass, studentEmail);
      return {
        success: true,
        message: `Successfully joined ${foundClass.name}`,
        classes: updated,
      };
    } catch (err) {
      const message = String(err?.message || "");
      if (message.includes("classes") && message.includes("does not exist")) {
        return {
          success: false,
          message: "Database not set up. Ask your teacher to run supabase/schema.sql in Supabase.",
        };
      }
      return { success: false, message: message || "Failed to join class." };
    }
  }

  const joinedClasses = getJoinedClasses();
  const foundClass = await findClassByJoinCode(joinCode);
  if (!foundClass) {
    return { success: false, message: INVALID_CODE_MESSAGE };
  }

  const alreadyJoined = joinedClasses.some((cls) => cls.id === foundClass.id);
  if (alreadyJoined) {
    return { success: false, message: "You have already joined this class." };
  }

  const updated = appendLocalEnrollment(foundClass, studentEmail);
  return { success: true, message: `Successfully joined ${foundClass.name}`, classes: updated };
};
