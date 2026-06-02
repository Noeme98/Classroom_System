import { getSupabaseConfigHints } from "./supabaseClient";

const DUPLICATE_EMAIL_CODES = new Set(["email_exists", "user_already_exists", "phone_exists"]);

function isLikelyNetworkFailure(rawMessage, error) {
  const m = String(rawMessage || "").toLowerCase();
  const cause = String(error?.cause?.message || "").toLowerCase();
  const blob = `${m} ${cause}`;
  return (
    blob.includes("failed to fetch") ||
    blob.includes("fetch failed") ||
    blob.includes("networkerror") ||
    blob.includes("network request failed") ||
    blob.includes("load failed") ||
    blob.includes("connection refused") ||
    blob.includes("could not resolve host") ||
    blob.includes("err_name_not_resolved") ||
    blob.includes("internet connection appears to be offline") ||
    blob.includes("network changed") ||
    blob.includes("blocked by cors") ||
    blob.includes("err_cert") ||
    blob.includes("certificate verify failed") ||
    blob.includes("ssl handshake")
  );
}

function formatNetworkAuthMessage() {
  const hints = getSupabaseConfigHints();
  const suffix = hints.length ? ` ${hints.join(" ")}` : "";
  return (
    "The browser could not reach Supabase (network error). " +
    "In Supabase: Project Settings → API — copy Project URL into VITE_SUPABASE_URL and the anon public key into VITE_SUPABASE_ANON_KEY in .env.local (no stray quotes or spaces). " +
    "Save the file, restart npm run dev, then open http://localhost:5173. " +
    "If it still fails, try another Wi‑Fi network or briefly disable VPN/firewall extensions." +
    suffix
  );
}

function isDuplicateAccountMessage(m) {
  if (!m) return false;
  if (m.includes("user already registered")) return true;
  if (m.includes("already been registered")) return true;
  if (m.includes("email address has already been registered")) return true;
  if (m.includes("email address is already")) return true;
  if (m.includes("already registered")) return true;
  return false;
}

/**
 * Human-friendly copy for common Supabase Auth errors (esp. email sending limits).
 */
export function formatAuthErrorMessage(rawMessage, error) {
  const code = String(error?.code || "").toLowerCase();
  if (DUPLICATE_EMAIL_CODES.has(code) || isDuplicateAccountMessage(String(rawMessage || "").toLowerCase())) {
    return "That email is already in use. Try logging in, or use a different email address.";
  }

  const m = String(rawMessage || "").toLowerCase();
  if (
    code === "invalid_credentials" ||
    m.includes("invalid login credentials") ||
    m.includes("invalid email or password")
  ) {
    return "Wrong email or password. Check caps lock, or reset your password if you forgot it.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return (
      "This project has hit Supabase’s email sending limit (common on the free tier after several signups or resends). " +
      "Wait about an hour, send fewer test emails, or add custom SMTP under Supabase → Authentication → Emails."
    );
  }
  if (m.includes("email not confirmed")) {
    return "Please verify your email first, then try logging in again.";
  }
  if (m.includes("database error querying schema")) {
    return "Sign-in failed due to a database configuration issue. Contact your administrator or try again later.";
  }
  if (isLikelyNetworkFailure(rawMessage, error)) {
    return formatNetworkAuthMessage();
  }
  return String(rawMessage || "Something went wrong. Try again.");
}
