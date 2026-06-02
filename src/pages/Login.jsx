import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { isSupabaseConfigured, supabase } from "../utils/supabaseClient";
import PasswordInput from "../components/PasswordInput";
import AuthPageShell from "../components/AuthPageShell";
import styles from "./Auth.module.css";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [authNotice, setAuthNotice] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    const hashRaw = window.location.hash.replace(/^#/, "") ?? "";
    const qp = new URLSearchParams(window.location.search);
    const hp = new URLSearchParams(hashRaw);

    const authErr = hp.get("error_description") || hp.get("error");
    if (authErr) {
      const text = decodeURIComponent(authErr).replace(/\+/g, " ");
      queueMicrotask(() => {
        setAuthNotice({ kind: "error", text });
      });
      window.history.replaceState(null, "", window.location.pathname);
      return undefined;
    }

    const fromEmailLink =
      qp.has("code") ||
      hp.has("access_token") ||
      hp.get("type") === "signup" ||
      hp.get("type") === "recovery";

    if (!fromEmailLink) return undefined;

    void (async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      window.history.replaceState(null, "", window.location.pathname);

      if (sessionError) {
        setAuthNotice({ kind: "error", text: sessionError.message });
        return;
      }
      if (session?.user) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setAuthNotice({
        kind: "success",
        text: "Email confirmed. Log in with your email and password.",
      });
    })();

    return undefined;
  }, [navigate]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage("Please enter your email and password.");
      return;
    }
    setErrorMessage("");
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result?.success) {
        setErrorMessage(result?.message || "Login failed.");
        return;
      }
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageShell>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>🏆</div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Log in to your classroom portal</p>
        </div>

        {authNotice && (
          <div
            className={
              authNotice.kind === "error" ? styles.authNoticeError : styles.authNoticeSuccess
            }
            role="status"
          >
            {authNotice.text}
          </div>
        )}

        <form onSubmit={handleLogin}>
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

          <div className={styles.field}>
            <label>Password</label>
            <PasswordInput
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className={styles.helperRow}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => navigate("/forgot-password")}
            >
              Forgot password?
            </button>
          </div>

          {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}

          <button type="submit" className={`${styles.btn} ${styles.btnPurple}`} disabled={submitting}>
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className={styles.xpBadge}>
          <span>⚡</span>
          <span>Your XP streak is waiting — don't lose your progress!</span>
        </div>

        <p className={styles.authSwitch}>
          No account yet?{" "}
          <button type="button" className={styles.linkBtn} onClick={() => navigate("/signup")}>
            Create one
          </button>
        </p>

      </div>
    </AuthPageShell>
  );
}

export default Login;