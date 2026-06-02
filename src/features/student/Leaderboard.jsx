import { useEffect, useMemo, useRef, useState } from "react";
import { getFinalizedRankingsByClass, getLeaderboard } from "../system/xpUtils";
import { getItem } from "../../utils/storage";
import styles from "./Leaderboard.module.css";

const TOP_N = 10;

const ROW_SHIFT_PX = 58;

function Leaderboard({ classId, currentUserEmail = null, initialActivityId = null, refreshKey = 0 }) {
  const [tab, setTab] = useState("class");
  const [activityId, setActivityId] = useState(initialActivityId || "");
  const [rankMotion, setRankMotion] = useState({});
  const prevRanksRef = useRef({});

  const students = getItem("students") || [];
  const badgesByEmail = getItem("badges") || {};
  const assignments = getItem("assignments") || [];
  const classLeaderboard = getLeaderboard(classId);
  const finalizedRankings = getFinalizedRankingsByClass(classId);

  const classTop = classLeaderboard.slice(0, TOP_N);
  const myClassRank = currentUserEmail
    ? classLeaderboard.findIndex((entry) => entry.email === currentUserEmail)
    : -1;

  const boardSignature = useMemo(
    () => classLeaderboard.map((e) => `${e.email}:${e.xp}`).join("|"),
    [classLeaderboard]
  );

  useEffect(() => {
    const top = classLeaderboard.slice(0, TOP_N);
    const nextRanks = {};
    classLeaderboard.forEach((entry, index) => {
      nextRanks[entry.email] = index + 1;
    });

    const motion = {};
    top.forEach((entry, index) => {
      const rank = index + 1;
      const prevRank = prevRanksRef.current[entry.email];
      if (prevRank != null && prevRank !== rank) {
        motion[entry.email] = prevRank - rank;
      }
    });

    prevRanksRef.current = nextRanks;

    if (Object.keys(motion).length > 0) {
      setRankMotion(motion);
      const timer = window.setTimeout(() => setRankMotion({}), 650);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [boardSignature, refreshKey, classLeaderboard]);

  useEffect(() => {
    if (finalizedRankings.length === 0) {
      setTab("class");
      setActivityId("");
      return;
    }
    if (
      initialActivityId &&
      finalizedRankings.some((r) => r.assignmentId === initialActivityId)
    ) {
      setTab("activity");
      setActivityId(initialActivityId);
      return;
    }
    if (!activityId || !finalizedRankings.some((r) => r.assignmentId === activityId)) {
      setActivityId(finalizedRankings[0].assignmentId);
    }
  }, [classId, finalizedRankings, activityId, initialActivityId]);

  const activeSnapshot = useMemo(
    () => finalizedRankings.find((entry) => entry.assignmentId === activityId) || null,
    [finalizedRankings, activityId]
  );

  const activityBoard = activeSnapshot?.leaderboard?.slice(0, TOP_N) || [];
  const myActivityRank = currentUserEmail && activeSnapshot
    ? activeSnapshot.leaderboard.findIndex((entry) => entry.email === currentUserEmail)
    : -1;

  const renderRow = (entry, rank, highlightEmail) => {
    const studentInfo = students.find((s) => s.email === entry.email);
    const studentBadges = badgesByEmail[entry.email] || [];
    const isMe = highlightEmail && entry.email === highlightEmail;
    const shift = rankMotion[entry.email];
    const motionClass =
      shift > 0 ? styles.itemRise : shift < 0 ? styles.itemFall : "";

    return (
      <li
        key={entry.email}
        className={`${styles.item} ${
          rank === 1 ? styles.first : rank === 2 ? styles.second : rank === 3 ? styles.third : ""
        } ${isMe ? styles.itemMe : ""} ${motionClass}`}
        style={
          shift
            ? { "--rank-shift": `${shift * ROW_SHIFT_PX}px` }
            : undefined
        }
      >
        <span className={styles.rank}>#{rank}</span>
        <div className={styles.studentBlock}>
          <span className={styles.email}>{isMe ? "You" : studentInfo?.name || entry.email}</span>
          {!isMe && <span className={styles.emailSub}>{entry.email}</span>}
          {studentBadges.length > 0 && (
            <div className={styles.badgesRow}>
              {studentBadges.slice(0, 2).map((badge) => (
                <span key={`${entry.email}_${badge}`} className={styles.badge}>
                  🏅 {badge}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={styles.xp}>{entry.xp} XP</span>
      </li>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.headRow}>
        <h2 className={styles.title}>🏆 Leaderboard</h2>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "class" ? styles.tabActive : ""}`}
            onClick={() => setTab("class")}
          >
            Class XP
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "activity" ? styles.tabActive : ""}`}
            onClick={() => setTab("activity")}
            disabled={finalizedRankings.length === 0}
          >
            By activity
          </button>
        </div>
      </div>

      {tab === "activity" && finalizedRankings.length > 0 && (
        <div className={styles.activityPicker}>
          <label className={styles.activityLabel} htmlFor="activity-select">
            Finalized activity
          </label>
          <select
            id="activity-select"
            className={styles.activitySelect}
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
          >
            {finalizedRankings.map((snapshot) => {
              const title =
                assignments.find((a) => a.id === snapshot.assignmentId)?.title ||
                `Activity ${snapshot.assignmentId}`;
              return (
                <option key={snapshot.assignmentId} value={snapshot.assignmentId}>
                  {title}
                </option>
              );
            })}
          </select>
          {activeSnapshot && (
            <span className={styles.lockedPill}>
              Locked {new Date(activeSnapshot.finalizedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {tab === "class" ? (
        classTop.length === 0 ? (
          <p className={styles.empty}>No XP yet. Start submitting assignments to earn points!</p>
        ) : (
          <>
            <p className={styles.tabHint}>Live total XP for this class (top {TOP_N})</p>
            <ul className={styles.list}>{classTop.map((entry, i) => renderRow(entry, i + 1, currentUserEmail))}</ul>
            {myClassRank >= TOP_N && (
              <p className={styles.myRank}>Your rank: #{myClassRank + 1} ({classLeaderboard[myClassRank]?.xp} XP)</p>
            )}
          </>
        )
      ) : activeSnapshot ? (
        activityBoard.length === 0 ? (
          <p className={styles.empty}>No ranking data for this activity.</p>
        ) : (
          <>
            <p className={styles.tabHint}>Frozen ranking after deadline (top {TOP_N})</p>
            <ul className={styles.list}>
              {activityBoard.map((entry) => renderRow(entry, entry.rank, currentUserEmail))}
            </ul>
            {myActivityRank >= TOP_N && (
              <p className={styles.myRank}>
                Your rank: #{myActivityRank + 1} (
                {activeSnapshot.leaderboard[myActivityRank]?.xp} XP at lock)
              </p>
            )}
          </>
        )
      ) : (
        <p className={styles.empty}>
          No finalized activities yet. Your teacher finalizes rankings after each deadline.
        </p>
      )}
    </div>
  );
}

export default Leaderboard;
