import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import AuthPageShell from "../components/AuthPageShell";
import styles from "./Auth.module.css";

function ForgotPassword() {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setSubmitting(true);
    const result = await requestPasswordReset(email);
    setSubmitting(false);
    if (!result?.success) {
      setErrorMessage(result?.message || "Failed to send reset email.");
      return;
    }
    setSuccessMessage(result.message);
  };

  return (
    <AuthPageShell>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>🔑</div>
          <h1 className={styles.title}>Reset your password</h1>
          <p className={styles.subtitle}>Enter your account email to receive a reset link</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}
          {successMessage && <p className={styles.successText}>{successMessage}</p>}

          <button type="submit" className={`${styles.btn} ${styles.btnPurple}`} disabled={submitting}>
            {submitting ? "Sending..." : "Send reset email"}
          </button>
        </form>

        <p className={styles.authSwitch}>
          Remembered your password?{" "}
          <button type="button" className={styles.linkBtn} onClick={() => navigate("/login")}>
            Back to log in
          </button>
        </p>
      </div>
    </AuthPageShell>
  );
}

export default ForgotPassword;
