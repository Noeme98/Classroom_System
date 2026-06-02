import AmbientSpaceBackground from "./AmbientSpaceBackground";
import styles from "./AuthPageShell.module.css";

/** Auth pages with ambient space background behind the form card. */
function AuthPageShell({ children }) {
  return (
    <div className={styles.page} data-auth-page>
      <AmbientSpaceBackground variant="auth" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export default AuthPageShell;
