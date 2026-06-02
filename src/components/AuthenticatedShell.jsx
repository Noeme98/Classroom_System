import AmbientSpaceBackground from "./AmbientSpaceBackground";
import CelebrationLayer from "./CelebrationLayer";
import styles from "./AuthenticatedShell.module.css";

/**
 * Wraps dashboard and in-app pages with subtle ambient motion and celebration overlays.
 */
function AuthenticatedShell({ children, className = "" }) {
  return (
    <div className={`${styles.shell} ${className}`.trim()}>
      <AmbientSpaceBackground variant="subtle" className={styles.ambient} />
      <CelebrationLayer />
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export default AuthenticatedShell;
