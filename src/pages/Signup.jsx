import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import PasswordInput from "../components/PasswordInput";
import AuthPageShell from "../components/AuthPageShell";
import styles from "./Auth.module.css";

function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password || !role) {
      setErrorMessage("Please complete all required fields.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setErrorMessage("");
    setSubmitting(true);
    const result = await signup({ email, password, role, fullName });
    setSubmitting(false);
    if (!result?.success) {
      setErrorMessage(result?.message || "Signup failed.");
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <AuthPageShell>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>🎓</div>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.subtitle}>Join a classroom or start teaching</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSignup();
          }}
        >
          <p className={styles.sectionLabel}>I am a...</p>
          <div className={styles.roleSelector}>
            <button
              type="button"
              className={`${styles.roleCard} ${role === "teacher" ? styles.roleTeacher : ""}`}
              onClick={() => setRole("teacher")}
            >
              <div className={styles.roleIcon}>👨‍🏫</div>
              <span className={styles.roleLabel}>Teacher</span>
              <span className={styles.roleDesc}>Create & manage classes</span>
            </button>
            <button
              type="button"
              className={`${styles.roleCard} ${role === "student" ? styles.roleStudent : ""}`}
              onClick={() => setRole("student")}
            >
              <div className={styles.roleIcon}>🧑‍🎓</div>
              <span className={styles.roleLabel}>Student</span>
              <span className={styles.roleDesc}>Earn XP & climb ranks</span>
            </button>
          </div>

          <div className={styles.field}>
            <label>Full Name</label>
            <input
              type="text"
              placeholder="Juan Dela Cruz"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>

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
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label>Confirm Password</label>
            <PasswordInput
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}

          <button
            type="submit"
            className={`${styles.btn} ${role === "teacher" ? styles.btnTeal : role === "student" ? styles.btnCoral : styles.btnDisabled}`}
            disabled={!role || submitting}
          >
            {submitting
              ? "Creating account..."
              : role
                ? `Create ${role === "teacher" ? "Teacher" : "Student"} Account`
                : "Select a role above"}
          </button>
        </form>

        {role && (
          <div className={`${styles.xpBadge} ${role === "teacher" ? styles.xpTeacher : styles.xpStudent}`}>
            <span>{role === "teacher" ? "🏫" : "🏅"}</span>
            <span>
              {role === "teacher"
                ? "You'll be able to create classes and generate join codes."
                : "You'll earn XP, unlock badges, and compete on leaderboards."}
            </span>
          </div>
        )}

        <p className={styles.authSwitch}>
          Already have an account?{" "}
          <button type="button" className={styles.linkBtn} onClick={() => navigate("/login")}>
            Log in
          </button>
        </p>
      </div>
    </AuthPageShell>
  );
}

export default Signup;
