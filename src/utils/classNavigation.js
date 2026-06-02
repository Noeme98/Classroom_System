import { isValidUuid } from "./uuid";

/** Build a subject-page URL with optional assignment focus. */
export function buildClassUrl(classId, assignmentId) {
  if (!classId) return "/dashboard";
  const base = `/dashboard/class/${classId}`;
  if (assignmentId && isValidUuid(String(assignmentId))) {
    return `${base}?assignment=${assignmentId}`;
  }
  return base;
}
