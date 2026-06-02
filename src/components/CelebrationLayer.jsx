import { useEffect, useState } from "react";
import { subscribeCelebrations } from "../utils/celebrationEvents";
import styles from "./CelebrationLayer.module.css";

function CelebrationLayer() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    return subscribeCelebrations((event) => {
      const id = `${event.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setEvents((prev) => [...prev, { id, ...event }]);
      const duration = event.type === "level-up" ? 3200 : event.type === "submission" ? 1400 : 2200;
      window.setTimeout(() => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
      }, duration);
    });
  }, []);

  if (events.length === 0) return null;

  return (
    <div className={styles.root} aria-live="polite">
      {events.map((event) => {
        if (event.type === "submission") {
          return (
            <div key={event.id} className={styles.submission}>
              <div className={styles.checkRing}>
                <i className="ti ti-check" aria-hidden="true" />
              </div>
              <p className={styles.submissionText}>Submitted!</p>
            </div>
          );
        }

        if (event.type === "level-up") {
          return (
            <div key={event.id} className={styles.levelUp}>
              <div className={styles.levelBurst} aria-hidden="true" />
              <div className={styles.levelCard}>
                <span className={styles.levelKicker}>Level up</span>
                <strong className={styles.levelNumber}>Level {event.level}</strong>
                <span className={styles.levelSub}>Keep the streak going!</span>
              </div>
            </div>
          );
        }

        const parts = [`+${event.amount} XP`];
        if (event.earlyBonus) parts.push(`+${event.earlyBonus} early`);
        if (event.streakBonus) parts.push(`+${event.streakBonus} streak`);

        return (
          <div key={event.id} className={styles.xpBurst}>
            <div className={styles.xpCore}>
              <i className="ti ti-bolt" aria-hidden="true" />
              <span>+{event.amount} XP</span>
            </div>
            {(event.earlyBonus > 0 || event.streakBonus > 0) && (
              <p className={styles.xpMeta}>{parts.slice(1).join(" · ")}</p>
            )}
            <div className={styles.particles} aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={styles.particle} style={{ "--i": i }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CelebrationLayer;
