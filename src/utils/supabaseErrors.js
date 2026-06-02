/** PostgREST / Postgres "undefined column" (common when schema.sql migrations were not applied). */
export function isMissingColumnError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" || (message.includes("column") && message.includes("does not exist"));
}
