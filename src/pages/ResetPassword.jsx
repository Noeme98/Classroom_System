import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { isSupabaseConfigured, supabase } from "../utils/supabaseClient";
import AuthPageShell from "../components/AuthPageShell";
import styles from "./Auth.module.css";

function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }
    let active = true;
    const checkRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setReady(Boolean(data?.session));
    };
    checkRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result?.success) {
      setErrorMessage(result?.message || "Failed to update password.");
      return;
    }
    setSuccessMessage(result.message);
    window.setTimeout(() => navigate("/login"), 1200);
  };

  return (
    <AuthPageShell>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>🛡️</div>
          <h1 className={styles.title}>Set a new password</h1>
          <p className={styles.subtitle}>
            {!ready
              ? "Open this page from your reset email link to continue."
              : "Create a strong password to secure your account."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>New Password</label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={!ready}
            />
          </div>

          <div className={styles.field}>
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={!ready}
            />
          </div>

          {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}
          {successMessage && <p className={styles.successText}>{successMessage}</p>}

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPurple}`}
            disabled={submitting || !ready}
          >
            {submitting ? "Updating..." : "Update password"}
          </button>
        </form>

        <p className={styles.authSwitch}>
          Back to{" "}
          <button type="button" className={styles.linkBtn} onClick={() => navigate("/login")}>
            log in
          </button>
        </p>
      </div>
    </AuthPageShell>
  );
}

export default ResetPassword;
