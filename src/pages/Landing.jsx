import { useNavigate } from "react-router-dom";
import AmbientSpaceBackground from "../components/AmbientSpaceBackground";
import styles from "./Landing.module.css";

function ClassXpLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon
        points="16,3 19.5,12 29,12 21.5,17.5 24.5,27 16,22 7.5,27 10.5,17.5 3,12 12.5,12"
        fill="#8B5CF6"
        stroke="#C4B5FD"
        strokeWidth="0.8"
      />
      <text x="16" y="18" textAnchor="middle" fontSize="7" fontWeight="700" fill="white" fontFamily="sans-serif">
        XP
      </text>
    </svg>
  );
}

function Landing() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <AmbientSpaceBackground />
      <div className={styles.shell}>
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <div className={styles.navLogoIcon}>
            <ClassXpLogo />
          </div>
          <span className={styles.navLogoName}>
            Class<span>XP</span>
          </span>
        </div>
        <div className={styles.navLinks}>
          <a href="#features">For teachers</a>
          <a href="#features">For students</a>
          <a href="#xp-preview">XP & badges</a>
        </div>
        <button type="button" className={styles.navCta} onClick={() => navigate("/signup")}>
          Get started
        </button>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} />
          XP-powered learning
        </div>
        <h1 className={styles.heroTitle}>
          The classroom that
          <span className={styles.heroAccent}>rewards progress</span>
        </h1>
        <p className={styles.heroSub}>
          Teachers create classes. Students earn XP, unlock badges, and stay motivated. Learning meets
          momentum.
        </p>
        <div className={styles.heroBtns}>
          <button type="button" className={styles.btnPrimary} onClick={() => navigate("/signup")}>
            Get started — it&apos;s free
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => navigate("/login")}>
            Log in
          </button>
        </div>
      </section>

      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <div className={styles.statNum}>12,400+</div>
          <div className={styles.statLabel}>Active students</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statNum}>870</div>
          <div className={styles.statLabel}>Classes created</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statNum}>3.2M</div>
          <div className={styles.statLabel}>XP earned</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statNum}>98%</div>
          <div className={styles.statLabel}>Completion rate</div>
        </div>
      </div>

      <section className={styles.features} id="features">
        <p className={styles.featuresEyebrow}>How it works</p>
        <h2 className={styles.featuresTitle}>Built for teachers. Loved by students.</h2>
        <div className={styles.featuresGrid}>
          <article className={styles.featCard}>
            <div className={`${styles.featIcon} ${styles.featPurple}`}>
              <i className="ti ti-school" aria-hidden="true" />
            </div>
            <h3 className={styles.featTitle}>For teachers</h3>
            <p className={styles.featDesc}>
              Create classes, post assignments, and track every student&apos;s progress in one place.
            </p>
          </article>
          <article className={styles.featCard}>
            <div className={`${styles.featIcon} ${styles.featGold}`}>
              <i className="ti ti-bolt" aria-hidden="true" />
            </div>
            <h3 className={styles.featTitle}>For students</h3>
            <p className={styles.featDesc}>
              Join classes with a code, submit work, and earn XP for every completed task.
            </p>
          </article>
          <article className={styles.featCard}>
            <div className={`${styles.featIcon} ${styles.featGreen}`}>
              <i className="ti ti-trophy" aria-hidden="true" />
            </div>
            <h3 className={styles.featTitle}>Leaderboards</h3>
            <p className={styles.featDesc}>
              See where you rank in your class. Compete, improve, and climb to the top.
            </p>
          </article>
        </div>
      </section>

      <div className={styles.xpSection} id="xp-preview">
        <div className={styles.xpAvatar}>JS</div>
        <div className={styles.xpInfo}>
          <div className={styles.xpName}>Jamie Santos</div>
          <div className={styles.xpMeta}>Grade 10 · Math & Science · Level 7</div>
          <div className={styles.xpTrack}>
            <div className={styles.xpFill} />
          </div>
          <div className={styles.xpCount}>680 / 1,000 XP to Level 8</div>
        </div>
        <div className={styles.xpBadges}>
          <span className={styles.badgePill}>
            <i className="ti ti-star" aria-hidden="true" /> Top 3
          </span>
          <span className={styles.badgePill}>
            <i className="ti ti-flame" aria-hidden="true" /> 7-day streak
          </span>
        </div>
      </div>

      <section className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>Ready to level up your classroom?</h2>
        <p className={styles.ctaSub}>Free to start. No credit card needed. Set up in under 5 minutes.</p>
        <div className={styles.ctaBtns}>
          <button type="button" className={styles.btnPrimary} onClick={() => navigate("/signup")}>
            Create your class
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => navigate("/login")}>
            Log in
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerCopy}>© {new Date().getFullYear()} ClassXP</span>
        <div className={styles.footerLinks}>
          <span>Privacy</span>
          <span>Terms</span>
          <span>Support</span>
        </div>
      </footer>
      </div>
    </div>
  );
}

export default Landing;
