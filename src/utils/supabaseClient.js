import { createClient } from "@supabase/supabase-js";

/** Trim and strip a single layer of wrapping quotes from .env values. */
export function normalizeEnvValue(v) {
  if (v == null) return "";
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function normalizeSupabaseUrl(url) {
  const u = normalizeEnvValue(url);
  if (!u) return "";
  return u.replace(/\/+$/, "");
}

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || ""
);
const supabaseAnonKey = normalizeEnvValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Non-secret checks for typical .env mistakes. Shown alongside "Failed to fetch" style errors.
 */
export function getSupabaseConfigHints() {
  const hints = [];
  if (!supabaseUrl || !supabaseAnonKey) return hints;

  if (supabaseUrl.startsWith("eyJ")) {
    hints.push(
      "Your URL looks like a JWT—you may have swapped VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local."
    );
  }
  try {
    const parsed = new URL(supabaseUrl);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      hints.push("Use https:// in VITE_SUPABASE_URL unless your Supabase is on localhost.");
    }
  } catch {
    hints.push('VITE_SUPABASE_URL must be a full URL (e.g. https://xxxxx.supabase.co).');
  }

  if (typeof window !== "undefined") {
    if (window.location?.protocol === "file:") {
      hints.push("Run the app with npm run dev and open http://localhost:5173—file:// URLs block API requests.");
    } else {
      try {
        const appHttps = window.location?.protocol === "https:";
        const sb = new URL(supabaseUrl);
        if (appHttps && sb.protocol === "http:") {
          hints.push("Your app is HTTPS but VITE_SUPABASE_URL is http—use https for the Supabase project URL.");
        }
      } catch {
        /* ignore */
      }
    }
  }

  return hints;
}

/**
 * React Strict Mode runs effects twice in dev. Supabase Auth uses a browser lock on
 * session storage; the first mount's lock can still be held when the second mount
 * starts, which triggers gotrue-js "lock was not released within 5000ms" warnings.
 * A no-op lock in dev is safe for local single-tab use.
 */
const devAuthLock = import.meta.env.DEV
  ? async (_name, _acquireTimeout, fn) => fn()
  : undefined;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(devAuthLock ? { lock: devAuthLock } : {}),
      },
    })
  : null;

export const assertSupabase = () => {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local."
    );
  }
  return supabase;
};
