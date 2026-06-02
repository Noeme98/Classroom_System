const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when value is a UUID Supabase accepts in uuid columns. */
export function isValidUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}
