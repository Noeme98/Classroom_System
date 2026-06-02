// Import localStorage helpers
import { getItem, setItem } from "../../utils/storage";
import { notifyUsers } from "../../utils/notificationUtils";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";
import { isValidUuid } from "../../utils/uuid";

// Key for XP storage in localStorage
const XP_KEY = "xpData";
const STREAKS_KEY = "streaks";
const BADGES_KEY = "badges";
const ACTIVITY_KEY = "activityMeta";
const FINALIZED_RANKINGS_KEY = "finalizedRankings";
const BADGE_CATALOG_TITLES = new Set([
  "First Step",
  "On a Roll",
  "Early Bird",
  "Scholar",
  "Rising Star",
  "Diamond",
  "Perfect Score",
  "Gold Scholar",
  "Silver Scholar",
  "Bronze Scholar",
]);

// ─────────────────────────────────────────
// getXPData()
// Safely returns XP object from localStorage
// ─────────────────────────────────────────
const getXPData = () => {
  const data = getItem(XP_KEY); // get stored XP data

  // Ensure we always return a valid object
  return data && typeof data === "object" ? data : {};
};

const getStreakData = () => {
  const data = getItem(STREAKS_KEY);
  return data && typeof data === "object" ? data : {};
};

const getBadgeData = () => {
  const data = getItem(BADGES_KEY);
  return data && typeof data === "object" ? data : {};
};

const getActivityData = () => {
  const data = getItem(ACTIVITY_KEY);
  return data && typeof data === "object" ? data : {};
};

const getFinalizedRankingsData = () => {
  const data = getItem(FINALIZED_RANKINGS_KEY);
  return data && typeof data === "object" ? data : {};
};

const getAssignments = () => getItem("assignments") || [];
const getSubmissions = () => getItem("submissions") || [];
const getClassStudents = () => getItem("classStudents") || {};
const getClasses = () => getItem("classes") || [];

const getProfileMapByEmails = async (emails = []) => {
  const uniqueEmails = [...new Set(emails.filter(Boolean))];
  if (uniqueEmails.length === 0) return {};
  const { data, error } = await supabase.from("profiles").select("id, email").in("email", uniqueEmails);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.email, row.id]));
};

const persistStreak = async ({ studentEmail, streak, lastSubmissionDate = null }) => {
  if (!isSupabaseConfigured) return;
  const profileMap = await getProfileMapByEmails([studentEmail]);
  const studentId = profileMap[studentEmail];
  if (!studentId) return;
  const payload = {
    student_id: studentId,
    streak,
    last_submission_date: lastSubmissionDate,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("streaks").upsert(payload, { onConflict: "student_id" });
  if (error) throw error;
};

const getEmailMapByIds = async (ids = []) => {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return {};
  const { data, error } = await supabase.from("profiles").select("id, email").in("id", uniqueIds);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.id, row.email]));
};

const persistXPScore = async ({ studentEmail, classId, xp }) => {
  if (!isSupabaseConfigured) return;
  const profileMap = await getProfileMapByEmails([studentEmail]);
  const studentId = profileMap[studentEmail];
  if (!studentId) return;
  const payload = {
    class_id: classId,
    student_id: studentId,
    xp,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("xp_scores")
    .upsert(payload, { onConflict: "class_id,student_id" });
  if (error) throw error;
};

const getClassIdsForStudent = (studentEmail) => {
  const fromRosters = Object.entries(getClassStudents())
    .filter(([, emails]) => Array.isArray(emails) && emails.includes(studentEmail))
    .map(([classId]) => String(classId));

  const fromXP = Object.keys(getXPData())
    .filter((key) => key.startsWith(`${studentEmail}_`))
    .map((key) => key.split("_")[1]);

  const fromAssignments = getAssignments()
    .filter((assignment) =>
      getSubmissions().some(
        (submission) =>
          submission.studentEmail === studentEmail &&
          String(submission.assignmentId) === String(assignment.id)
      )
    )
    .map((assignment) => String(assignment.classId));

  return [...new Set([...fromRosters, ...fromXP, ...fromAssignments])];
};

const toDateOnly = (isoDate) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const getDateDiffInDays = (fromDateOnly, toDateOnlyValue) => {
  const from = new Date(`${fromDateOnly}T00:00:00.000Z`);
  const to = new Date(`${toDateOnlyValue}T00:00:00.000Z`);
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

// ─────────────────────────────────────────
// addXP(studentEmail, classId, amount)
// Adds XP for a student in a specific class
// ─────────────────────────────────────────
export const addXP = (studentEmail, classId, amount) => {
  const key = `${studentEmail}_${classId}`; // unique per student per class

  const data = getXPData(); // load current XP data

  data[key] = (data[key] || 0) + amount; // add XP safely

  setItem(XP_KEY, data); // save back to storage

  if (isSupabaseConfigured) {
    void persistXPScore({ studentEmail, classId, xp: data[key] }).catch(() => undefined);
  }
};

// ─────────────────────────────────────────
// getXP(studentEmail, classId)
// Gets XP for a specific student in a class
// ─────────────────────────────────────────
export const getXP = (studentEmail, classId) => {
  const key = `${studentEmail}_${classId}`; // same key format

  const data = getXPData(); // load data

  return data[key] || 0; // return XP or 0
};

/** XP required per level (matches landing mock: 1,000 XP per level). */
export const XP_PER_LEVEL = 1000;

export const getLevelFromXP = (xp) => Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL) + 1;

export const getXPLevelProgress = (xp) => {
  const safe = Math.max(0, Number(xp) || 0);
  const level = getLevelFromXP(safe);
  const into = safe % XP_PER_LEVEL;
  return {
    level,
    into,
    need: XP_PER_LEVEL,
    pct: Math.round((into / XP_PER_LEVEL) * 100),
  };
};

export const getStreak = (studentEmail) => {
  const data = getStreakData();
  return data[studentEmail] || 0;
};

export const syncStreakForStudent = async (studentEmail) => {
  if (!studentEmail || !isSupabaseConfigured) return getStreak(studentEmail);
  try {
    const profileMap = await getProfileMapByEmails([studentEmail]);
    const studentId = profileMap[studentEmail];
    if (!studentId) return getStreak(studentEmail);
    const { data, error } = await supabase
      .from("streaks")
      .select("streak, last_submission_date")
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) throw error;
    const streakData = getStreakData();
    if (data) {
      streakData[studentEmail] = Number(data.streak) || 0;
      setItem(STREAKS_KEY, streakData);
      const activity = getActivityData();
      activity[studentEmail] = { lastSubmissionDate: data.last_submission_date || null };
      setItem(ACTIVITY_KEY, activity);
    }
    return streakData[studentEmail] || 0;
  } catch {
    return getStreak(studentEmail);
  }
};

export const syncXPByClass = async (classId) => {
  if (!classId || !isValidUuid(classId) || !isSupabaseConfigured) return getLeaderboard(classId);
  try {
    const { data, error } = await supabase
      .from("xp_scores")
      .select("class_id, student_id, xp")
      .eq("class_id", classId);
    if (error) throw error;
    const emailById = await getEmailMapByIds((data || []).map((row) => row.student_id));
    const current = getXPData();
    Object.keys(current).forEach((key) => {
      if (key.endsWith(`_${String(classId)}`)) delete current[key];
    });
    (data || []).forEach((row) => {
      const email = emailById[row.student_id];
      if (!email) return;
      current[`${email}_${String(row.class_id)}`] = Number(row.xp) || 0;
    });
    setItem(XP_KEY, current);
    return getLeaderboard(classId);
  } catch {
    return getLeaderboard(classId);
  }
};

export const getBadges = (studentEmail) => {
  const progress = getBadgeProgress(studentEmail);
  return progress
    .flatMap((group) => group.items)
    .filter((item) => item.earned)
    .map((item) => item.title);
};

export const getBadgeProgress = (studentEmail, classIds = null) => {
  const allAssignments = getAssignments();
  const assignmentsById = Object.fromEntries(allAssignments.map((assignment) => [assignment.id, assignment]));
  const allSubmissions = getSubmissions().filter((submission) => submission.studentEmail === studentEmail);
  const classIdScope = (classIds && classIds.length > 0 ? classIds : getClassIdsForStudent(studentEmail)).map(String);
  const scopedSubmissions = classIdScope.length > 0
    ? allSubmissions.filter((submission) => classIdScope.includes(String(submission.classId)))
    : allSubmissions;

  const submissionCount = scopedSubmissions.length;
  const streak = getStreak(studentEmail);
  const earlyBirdCount = scopedSubmissions.filter((submission) => {
    const assignment = assignmentsById[submission.assignmentId];
    if (!assignment?.dueDate || !submission.submittedAt) return false;
    const dueAt = new Date(`${assignment.dueDate}T23:59:59`);
    const submittedAt = new Date(submission.submittedAt);
    if (Number.isNaN(dueAt.getTime()) || Number.isNaN(submittedAt.getTime())) return false;
    return submittedAt.getTime() <= dueAt.getTime() - (24 * 60 * 60 * 1000);
  }).length;

  const classProgress = classIdScope.map((classId) => {
    const classAssignments = allAssignments.filter((assignment) => String(assignment.classId) === String(classId));
    const submittedAssignmentIds = new Set(
      scopedSubmissions
        .filter((submission) => String(submission.classId) === String(classId))
        .map((submission) => String(submission.assignmentId))
    );
    return {
      classId: String(classId),
      total: classAssignments.length,
      submitted: submittedAssignmentIds.size,
      complete: classAssignments.length > 0 && submittedAssignmentIds.size >= classAssignments.length,
    };
  });
  const scholarClass = classProgress.find((entry) => entry.complete) || null;
  const bestClassProgress = classProgress.sort((a, b) => (b.submitted / (b.total || 1)) - (a.submitted / (a.total || 1)))[0];
  const classes = getClasses();
  const scholarClassName =
    classes.find((entry) => String(entry.id) === String(scholarClass?.classId))?.name || "a class";

  const xpData = getXPData();
  const xpValues = Object.entries(xpData)
    .filter(([key]) => key.startsWith(`${studentEmail}_`))
    .map(([, xp]) => Number(xp) || 0);
  const highestXP = xpValues.length > 0 ? Math.max(...xpValues) : 0;

  const bestScore = scopedSubmissions
    .map((submission) => Number(submission.grade))
    .filter((grade) => Number.isFinite(grade))
    .reduce((max, grade) => Math.max(max, grade), 0);

  const rankEntries = classIdScope
    .map((classId) => {
      const rank = getLeaderboard(classId).findIndex((entry) => entry.email === studentEmail);
      return rank >= 0 ? { classId, rank: rank + 1 } : null;
    })
    .filter(Boolean);
  const bestRank = rankEntries.sort((a, b) => a.rank - b.rank)[0] || null;
  const bestRankClassName =
    classes.find((entry) => String(entry.id) === String(bestRank?.classId))?.name || "class";

  const categories = [
    {
      id: "submission",
      label: "Submission Badges",
      items: [
        {
          id: "first-step",
          title: "First Step",
          earned: submissionCount >= 1,
          description: "Submit your first assignment.",
          progress: submissionCount >= 1 ? "Earned" : "0 / 1 submission",
        },
        {
          id: "on-a-roll",
          title: "On a Roll",
          earned: streak >= 3,
          description: "Submit 3 assignments in a streak.",
          progress: streak >= 3 ? "Earned" : `${Math.min(streak, 3)} / 3 streak days`,
        },
        {
          id: "early-bird",
          title: "Early Bird",
          earned: earlyBirdCount >= 1,
          description: "Submit 24+ hours before deadline.",
          progress: earlyBirdCount >= 1 ? "Earned" : "Not yet earned",
        },
        {
          id: "scholar",
          title: "Scholar",
          earned: Boolean(scholarClass),
          description: "Submit every assignment in one class.",
          progress: scholarClass
            ? `Earned — ${scholarClassName}`
            : `${bestClassProgress?.submitted || 0} / ${bestClassProgress?.total || 0} in best class`,
        },
      ],
    },
    {
      id: "xp",
      label: "XP Badges",
      items: [
        {
          id: "rising-star",
          title: "Rising Star",
          earned: highestXP >= 100,
          description: "Reach 100 XP in any class.",
          progress: highestXP >= 100 ? "Earned" : `${Math.min(highestXP, 100)} / 100 XP`,
        },
        {
          id: "diamond",
          title: "Diamond",
          earned: highestXP >= 500,
          description: "Reach 500 XP in any class.",
          progress: highestXP >= 500 ? "Earned" : `${Math.min(highestXP, 500)} / 500 XP`,
        },
      ],
    },
    {
      id: "performance",
      label: "Performance Badges",
      items: [
        {
          id: "perfect-score",
          title: "Perfect Score",
          earned: bestScore >= 100,
          description: "Get a grade of 100 on any assignment.",
          progress: bestScore >= 100 ? "Earned" : `${bestScore || 0} / 100 best score`,
        },
      ],
    },
    {
      id: "ranking",
      label: "Ranking Badges — Top 3 per class",
      items: [
        {
          id: "gold-scholar",
          title: "Gold Scholar",
          earned: rankEntries.some((entry) => entry.rank === 1),
          description: "Ranked #1 in a class leaderboard.",
          progress: rankEntries.some((entry) => entry.rank === 1)
            ? `Earned — ${bestRankClassName}`
            : bestRank
            ? `Best rank #${bestRank.rank}`
            : "Join a ranked class",
        },
        {
          id: "silver-scholar",
          title: "Silver Scholar",
          earned: rankEntries.some((entry) => entry.rank === 2),
          description: "Ranked #2 in a class leaderboard.",
          progress: rankEntries.some((entry) => entry.rank === 2)
            ? "Earned"
            : bestRank
            ? `Climb to #2 from #${bestRank.rank}`
            : "Join a ranked class",
        },
        {
          id: "bronze-scholar",
          title: "Bronze Scholar",
          earned: rankEntries.some((entry) => entry.rank === 3),
          description: "Ranked #3 in a class leaderboard.",
          progress: rankEntries.some((entry) => entry.rank === 3)
            ? "Earned"
            : bestRank
            ? `Climb to #3 from #${bestRank.rank}`
            : "Join a ranked class",
        },
      ],
    },
  ];

  // Keep storage in sync for existing UI surfaces that depend on badge arrays.
  const earnedTitles = categories
    .flatMap((group) => group.items)
    .filter((item) => item.earned)
    .map((item) => item.title);
  const badgeData = getBadgeData();
  const existing = badgeData[studentEmail] || [];
  const legacy = existing.filter((title) => !BADGE_CATALOG_TITLES.has(title));
  badgeData[studentEmail] = [...new Set([...legacy, ...earnedTitles])];
  setItem(BADGES_KEY, badgeData);
  if (isSupabaseConfigured) {
    void (async () => {
      try {
        const profileMap = await getProfileMapByEmails([studentEmail]);
        const studentId = profileMap[studentEmail];
        if (!studentId) return;
        const payload = earnedTitles.map((badge) => ({ student_id: studentId, badge_key: badge }));
        if (payload.length > 0) {
          await supabase.from("badges").upsert(payload, { onConflict: "student_id,badge_key" });
        }
      } catch {
        // ignore transient badge sync errors
      }
    })();
  }

  return categories;
};

export const syncBadgesForStudent = async (studentEmail) => {
  if (!studentEmail || !isSupabaseConfigured) return getBadges(studentEmail);
  try {
    const profileMap = await getProfileMapByEmails([studentEmail]);
    const studentId = profileMap[studentEmail];
    if (!studentId) return getBadges(studentEmail);
    const { data, error } = await supabase
      .from("badges")
      .select("badge_key")
      .eq("student_id", studentId);
    if (error) throw error;
    const badgeData = getBadgeData();
    const existing = badgeData[studentEmail] || [];
    const merged = [...new Set([...existing, ...(data || []).map((row) => row.badge_key)])];
    badgeData[studentEmail] = merged;
    setItem(BADGES_KEY, badgeData);
    return merged;
  } catch {
    return getBadges(studentEmail);
  }
};

export const awardSubmissionProgress = ({
  studentEmail,
  classId,
  dueDate,
  submittedAt = new Date().toISOString(),
}) => {
  const badgesBefore = new Set(getBadges(studentEmail));
  const xpBefore = getXP(studentEmail, classId);
  const levelBefore = getLevelFromXP(xpBefore);
  let totalXP = 10; // base submission XP
  let earlyBonus = 0;
  let streakBonus = 0;

  const submissionDateOnly = toDateOnly(submittedAt);
  const dueDateOnly = dueDate ? toDateOnly(`${dueDate}T00:00:00.000Z`) : null;

  if (submissionDateOnly && dueDateOnly && submissionDateOnly <= dueDateOnly) {
    earlyBonus = 5;
    totalXP += earlyBonus;
  }

  const activity = getActivityData();
  const previousDay = activity[studentEmail]?.lastSubmissionDate || null;
  const streakData = getStreakData();
  let nextStreak = streakData[studentEmail] || 0;

  // Important: streak updates only once per day and rewards consistent daily submissions.
  if (!previousDay) {
    nextStreak = 1;
  } else {
    const dayDiff = getDateDiffInDays(previousDay, submissionDateOnly || previousDay);
    if (dayDiff === 1) {
      nextStreak += 1;
    } else if (dayDiff > 1) {
      nextStreak = 1;
    }
  }

  streakData[studentEmail] = nextStreak;
  setItem(STREAKS_KEY, streakData);
  activity[studentEmail] = { lastSubmissionDate: submissionDateOnly || previousDay };
  setItem(ACTIVITY_KEY, activity);
  if (isSupabaseConfigured) {
    void persistStreak({
      studentEmail,
      streak: nextStreak,
      lastSubmissionDate: submissionDateOnly || previousDay || null,
    }).catch(() => undefined);
  }

  if (nextStreak >= 2) {
    streakBonus = Math.min(nextStreak * 2, 10);
    totalXP += streakBonus;
  }

  addXP(studentEmail, classId, totalXP);
  const xpAfter = getXP(studentEmail, classId);
  const levelAfter = getLevelFromXP(xpAfter);
  const badgesAfter = getBadges(studentEmail);
  const unlockedBadges = badgesAfter.filter((badge) => !badgesBefore.has(badge));

  return {
    totalXP,
    earlyBonus,
    streakBonus,
    streak: nextStreak,
    unlockedBadges,
    xpBefore,
    xpAfter,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
  };
};

export const awardGradingBonus = ({ studentEmail, classId, score }) => {
  const badgesBefore = new Set(getBadges(studentEmail));
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return { bonusXP: 0, unlockedBadges: [] };
  }

  let bonusXP;
  if (numericScore >= 95) bonusXP = 12;
  else if (numericScore >= 90) bonusXP = 10;
  else if (numericScore >= 85) bonusXP = 7;
  else if (numericScore >= 75) bonusXP = 4;
  else bonusXP = 2;

  addXP(studentEmail, classId, bonusXP);
  const badgesAfter = getBadges(studentEmail);
  const unlockedBadges = badgesAfter.filter((badge) => !badgesBefore.has(badge));

  return { bonusXP, unlockedBadges };
};

// ─────────────────────────────────────────
// getLeaderboard(classId)
// Returns sorted XP list for a class
// ─────────────────────────────────────────
export const getLeaderboard = (classId) => {
  const data = getXPData(); // all XP records

  const entries = Object.entries(data).filter(([key]) => {
    const parts = key.split("_"); // safer parsing
    return String(parts[1]) === String(classId); // match classId only
  });

  const leaderboard = entries.map(([key, xp]) => ({
    email: key.split("_")[0], // extract email safely
    xp,
  }));

  leaderboard.sort((a, b) => b.xp - a.xp); // highest first

  return leaderboard;
};

const getRankBonus = (rank) => {
  if (rank === 1) return 20;
  if (rank === 2) return 15;
  if (rank === 3) return 12;
  if (rank === 4) return 10;
  if (rank === 5) return 8;
  if (rank <= 10) return 5;
  return 2;
};

export const getFinalizedAssignmentRanking = (assignmentId) => {
  const data = getFinalizedRankingsData();
  return data[assignmentId] || null;
};

export const getFinalizedRankingsByClass = (classId) => {
  const data = getFinalizedRankingsData();
  return Object.values(data)
    .filter((entry) => String(entry.classId) === String(classId))
    .sort((a, b) => new Date(b.finalizedAt) - new Date(a.finalizedAt));
};

export const syncFinalizedRankingsByClass = async (classId) => {
  if (!classId || !isSupabaseConfigured) return getFinalizedRankingsByClass(classId);
  try {
    const { data, error } = await supabase
      .from("finalized_rankings")
      .select("assignment_id, class_id, snapshot, finalized_at")
      .eq("class_id", classId);
    if (error) throw error;
    const current = getFinalizedRankingsData();
    (data || []).forEach((row) => {
      const snapshot = row.snapshot || {};
      current[row.assignment_id] = {
        assignmentId: row.assignment_id,
        classId: row.class_id,
        finalizedAt: row.finalized_at,
        leaderboard: snapshot.leaderboard || [],
        awardedBonuses: snapshot.awardedBonuses || [],
      };
    });
    setItem(FINALIZED_RANKINGS_KEY, current);
    return getFinalizedRankingsByClass(classId);
  } catch {
    return getFinalizedRankingsByClass(classId);
  }
};

export const finalizeAssignmentRanking = ({ assignmentId, classId }) => {
  if (!assignmentId || !classId) {
    return { success: false, message: "Missing assignment data for finalization." };
  }

  const finalized = getFinalizedRankingsData();
  if (finalized[assignmentId]) {
    return {
      success: false,
      message: "This activity ranking is already finalized.",
      ranking: finalized[assignmentId],
    };
  }

  const liveLeaderboard = getLeaderboard(classId);
  if (liveLeaderboard.length === 0) {
    return { success: false, message: "No leaderboard data available to finalize." };
  }

  const awardedBonuses = [];
  liveLeaderboard.forEach((entry, index) => {
    const rank = index + 1;
    const bonusXP = getRankBonus(rank);
    addXP(entry.email, classId, bonusXP);
    awardedBonuses.push({ email: entry.email, rank, bonusXP });
  });

  const frozenLeaderboard = getLeaderboard(classId).map((entry, index) => ({
    rank: index + 1,
    email: entry.email,
    xp: entry.xp,
  }));

  const rankingSnapshot = {
    assignmentId,
    classId,
    finalizedAt: new Date().toISOString(),
    leaderboard: frozenLeaderboard,
    awardedBonuses,
  };

  finalized[assignmentId] = rankingSnapshot;
  setItem(FINALIZED_RANKINGS_KEY, finalized);
  if (isSupabaseConfigured) {
    void supabase.from("finalized_rankings").upsert(
      {
        assignment_id: assignmentId,
        class_id: classId,
        snapshot: {
          leaderboard: rankingSnapshot.leaderboard,
          awardedBonuses: rankingSnapshot.awardedBonuses,
        },
        finalized_at: rankingSnapshot.finalizedAt,
      },
      { onConflict: "assignment_id" }
    );
  }

  const classes = getClasses();
  const classStudents = getClassStudents();
  const className =
    classes.find((entry) => String(entry.id) === String(classId))?.name || "your class";
  notifyUsers({
    recipientEmails: classStudents[String(classId)] || [],
    title: "Final leaderboard locked",
    body: `Final rankings are now available for ${className}.`,
    type: "ranking",
    meta: { assignmentId, classId },
  });

  return {
    success: true,
    message: "Ranking finalized and bonus XP awarded. Leaderboard is now locked for this activity.",
    ranking: rankingSnapshot,
  };
};

export const isAssignmentPastDue = (dueDate) => {
  if (!dueDate) return false;
  const dueAt = new Date(`${String(dueDate).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return false;
  return new Date() > dueAt;
};

export const getAssignmentsReadyToFinalize = (classIds = null) => {
  const assignments = getAssignments();
  const finalized = getFinalizedRankingsData();
  const scope =
    classIds && classIds.length > 0
      ? new Set(classIds.map((id) => String(id)))
      : null;

  return assignments.filter((assignment) => {
    if (scope && !scope.has(String(assignment.classId))) return false;
    if (!isAssignmentPastDue(assignment.dueDate)) return false;
    return !finalized[assignment.id];
  });
};

/** Finalize every past-due activity that is not locked yet (system engine batch). */
export const processAllDueActivities = ({ classIds = null } = {}) => {
  const ready = getAssignmentsReadyToFinalize(classIds);
  const finalized = [];
  const failed = [];

  ready.forEach((assignment) => {
    const result = finalizeAssignmentRanking({
      assignmentId: assignment.id,
      classId: assignment.classId,
    });
    if (result.success) {
      finalized.push({
        id: assignment.id,
        title: assignment.title,
        classId: assignment.classId,
      });
    } else {
      failed.push({
        id: assignment.id,
        title: assignment.title,
        message: result.message,
      });
    }
  });

  if (ready.length === 0) {
    return {
      success: true,
      message: "No due activities need finalizing right now.",
      finalizedCount: 0,
      failedCount: 0,
      finalized,
      failed,
    };
  }

  if (finalized.length === 0) {
    const hint = failed[0]?.message || "No leaderboard data yet.";
    return {
      success: false,
      message: `Could not finalize any activities. ${hint}`,
      finalizedCount: 0,
      failedCount: failed.length,
      finalized,
      failed,
    };
  }

  const partial = failed.length > 0;
  const message = partial
    ? `Finalized ${finalized.length} of ${ready.length} activities. ${failed.length} skipped (often no XP on the board yet). Students were notified for completed finalizations.`
    : `Finalized ${finalized.length} activit${finalized.length === 1 ? "y" : "ies"}. Ranking bonus XP awarded and students notified.`;

  return {
    success: true,
    message,
    finalizedCount: finalized.length,
    failedCount: failed.length,
    finalized,
    failed,
  };
};