import { getItem, removeItem, setItem } from "./storage";

/** Bump when local-only demo/cache shape changes and must be wiped once. */
const LOCAL_DATA_VERSION = 2;
const VERSION_KEY = "localDataVersion";

const APP_DATA_KEYS = [
  "classes",
  "assignments",
  "submissions",
  "joinedClasses",
  "xpData",
  "students",
  "badges",
  "streaks",
  "classStudents",
  "activityMeta",
  "notifications",
  "finalizedRankings",
  "announcements",
  "demoSeed_v5",
  "demoSeed_v4",
  "demoSeed_v3",
  "demoSeed",
];

/**
 * One-time wipe of browser-only demo/cache data so Supabase sync is the source of truth.
 * Does not clear auth session (`user`) or UI prefs (`theme`).
 */
export function migrateLocalAppData() {
  if (getItem(VERSION_KEY) === LOCAL_DATA_VERSION) return;

  APP_DATA_KEYS.forEach((key) => removeItem(key));
  setItem(VERSION_KEY, LOCAL_DATA_VERSION);
}
