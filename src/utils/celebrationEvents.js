const listeners = new Set();

/** @typedef {{ type: 'submission' }} SubmissionCelebration */
/** @typedef {{ type: 'xp', amount: number, earlyBonus?: number, streakBonus?: number }} XpCelebration */
/** @typedef {{ type: 'level-up', level: number }} LevelUpCelebration */
/** @typedef {SubmissionCelebration | XpCelebration | LevelUpCelebration} CelebrationEvent */

export function emitCelebration(event) {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.error("Celebration listener failed:", err);
    }
  });
}

export function subscribeCelebrations(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
