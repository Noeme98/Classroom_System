import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { getClasses } from "../features/teacher/teacherUtils";
import { getJoinedClasses } from "../features/student/studentUtils";
import AssignmentPanel from "../features/teacher/AssignmentPanel";
import AssignmentList from "../features/student/AssignmentList";
import ClassRoster from "../features/teacher/ClassRoster";
import StudentProgress from "../features/student/StudentProgress";
import StudentClassGrades from "../features/student/StudentClassGrades";
import ClassStream from "../features/stream/ClassStream";
import TeacherAnalytics from "../features/teacher/TeacherAnalytics";
import { getAssignmentsByClass, syncAssignmentsByClass } from "../features/teacher/assignmentUtils";
import { exportGradebookCsv } from "../features/teacher/gradebookUtils";
import { syncSubmissionsByClass } from "../features/student/submissionUtils";
import { syncAnnouncementsByClass } from "../features/stream/announcementUtils";
import { syncXPByClass, getXP } from "../features/system/xpUtils";
import { syncClassRosters } from "../utils/rosterSync";
import { isValidUuid } from "../utils/uuid";
import { copyToClipboard } from "../utils/copyToClipboard";
import Leaderboard from "../features/student/Leaderboard";
import styles from "./SubjectPage.module.css";

const TEACHER_TABS = [
  { id: "announcements", label: "Announcements", icon: "ti-speakerphone" },
  { id: "assignments", label: "Assignments", icon: "ti-clipboard-list" },
  { id: "analytics", label: "Analytics", icon: "ti-chart-bar" },
  { id: "roster", label: "Roster", icon: "ti-users" },
  { id: "submissions", label: "Submissions", icon: "ti-file-check" },
];

const STUDENT_TABS = [
  { id: "overview", label: "Overview", icon: "ti-chart-dots" },
  { id: "announcements", label: "Announcements", icon: "ti-speakerphone" },
  { id: "assignments", label: "Assignments", icon: "ti-clipboard-list" },
  { id: "grades", label: "Grades", icon: "ti-report-analytics" },
];

function SubjectPage() {
  const { user, logout, authLoading } = useAuth();
  const navigate = useNavigate();
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusAssignmentId =
    searchParams.get("assignment") && isValidUuid(searchParams.get("assignment"))
      ? searchParams.get("assignment")
      : "";
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const [copyHint, setCopyHint] = useState("");
  const [teacherTab, setTeacherTab] = useState(
    focusAssignmentId ? "submissions" : "announcements"
  );
  const [studentTab, setStudentTab] = useState(
    focusAssignmentId ? "assignments" : "overview"
  );

  const isTeacher = user?.role === "teacher";

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!focusAssignmentId) return;
    if (isTeacher) {
      setTeacherTab("submissions");
    } else {
      setStudentTab("assignments");
    }
  }, [focusAssignmentId, isTeacher]);

  const allowedClasses = useMemo(
    () => (isTeacher ? getClasses() : getJoinedClasses()),
    [isTeacher, refreshTick]
  );

  const activeClass = allowedClasses.find((cls) => String(cls.id) === String(classId));

  useEffect(() => {
    if (!authLoading && user && !activeClass) {
      navigate("/dashboard");
    }
  }, [authLoading, user, activeClass, navigate]);

  useEffect(() => {
    const run = async () => {
      if (!classId) return;
      await syncAssignmentsByClass(classId);
      await syncSubmissionsByClass(classId);
      await syncAnnouncementsByClass(classId);
      await syncXPByClass(classId);
      await syncClassRosters([classId]);
      setRefreshTick((n) => n + 1);
    };
    run();
  }, [classId]);

  const copyJoinCode = async () => {
    if (!activeClass?.code) return;
    const ok = await copyToClipboard(activeClass.code);
    setCopyHint(ok ? "Join code copied!" : "Could not copy — select the code manually.");
    window.setTimeout(() => setCopyHint(""), 2200);
  };

  const focusAssignment = (assignmentId, targetTab) => {
    if (!assignmentId || !isValidUuid(String(assignmentId))) return;
    setSearchParams({ assignment: assignmentId });
    if (isTeacher) {
      setTeacherTab("submissions");
    } else {
      setStudentTab(targetTab || "assignments");
    }
  };

  if (!user || !activeClass) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading subject...</p>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const assignmentCount = getAssignmentsByClass(activeClass.id).length;
  const classXp = !isTeacher ? getXP(user.email, activeClass.id) : 0;
  const classTabs = isTeacher ? TEACHER_TABS : STUDENT_TABS;
  const activeTab = isTeacher ? teacherTab : studentTab;
  const setActiveTab = isTeacher ? setTeacherTab : setStudentTab;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.backBtn} onClick={() => navigate("/dashboard")}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
            Dashboard
          </button>
          <span className={styles.logoText}>
            Class<span>XP</span>
          </span>
        </div>
        <div className={styles.topbarRight}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          >
            <i className={theme === "dark" ? "ti ti-sun" : "ti ti-moon"} aria-hidden="true" />
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button type="button" className={styles.btnDanger} onClick={handleLogout}>
            <i className="ti ti-logout" aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>

      <section className={styles.classHeader}>
        <div>
          <h1 className={styles.classTitle}>{activeClass.name}</h1>
          <p className={styles.classSub}>
            {isTeacher
              ? `${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"} · grade and post from this page`
              : "Submit work, read announcements, and track your progress"}
          </p>
        </div>
        <div className={styles.joinCodeBox}>
          {isTeacher ? (
            <>
              <span className={styles.joinCodeLabel}>Join code</span>
              <button type="button" className={styles.joinCode} onClick={copyJoinCode} title="Click to copy">
                {activeClass.code}
              </button>
              {copyHint ? <span className={styles.copyHint}>{copyHint}</span> : null}
            </>
          ) : (
            <>
              <span className={styles.joinCodeLabel}>Your XP</span>
              <span className={styles.xpValue}>
                <i className="ti ti-bolt" aria-hidden="true" /> {classXp} XP
              </span>
              <span className={styles.xpSub}>{assignmentCount} assignment{assignmentCount === 1 ? "" : "s"}</span>
            </>
          )}
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Class sections">
        {classTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`ti ${tab.icon}`} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </nav>

      <main className={styles.content}>
        {isTeacher ? (
          <>
            {teacherTab === "announcements" && (
              <ClassStream
                classId={activeClass.id}
                isTeacher={isTeacher}
                user={user}
                layout="split"
              />
            )}
            {teacherTab === "assignments" && (
              <AssignmentPanel
                classes={[activeClass]}
                selectedClassId={activeClass.id}
                view="assignments"
                embedded
              />
            )}
            {teacherTab === "analytics" && (
              <TeacherAnalytics classId={activeClass.id} className={activeClass.name} />
            )}
            {teacherTab === "roster" && (
              <ClassRoster
                classId={activeClass.id}
                onExportGrades={() => exportGradebookCsv(activeClass.id, activeClass.name)}
                exportDisabled={assignmentCount === 0}
                layout="page"
              />
            )}
            {teacherTab === "submissions" && (
              <AssignmentPanel
                classes={[activeClass]}
                selectedClassId={activeClass.id}
                initialAssignmentId={focusAssignmentId}
                view="grading"
                embedded
              />
            )}
          </>
        ) : (
          <>
            {studentTab === "overview" && (
              <div className={styles.overviewStack}>
                <StudentProgress
                  classId={activeClass.id}
                  studentEmail={user.email}
                  className={activeClass.name}
                  onOpenAssignment={(id) => focusAssignment(id, "assignments")}
                />
                <Leaderboard
                  classId={activeClass.id}
                  currentUserEmail={user.email}
                  refreshKey={refreshTick}
                />
              </div>
            )}
            {studentTab === "announcements" && (
              <ClassStream
                classId={activeClass.id}
                isTeacher={false}
                user={user}
                layout="student"
              />
            )}
            {studentTab === "assignments" && (
              <AssignmentList
                assignments={getAssignmentsByClass(activeClass.id)}
                classId={activeClass.id}
                studentEmail={user.email}
                focusAssignmentId={focusAssignmentId}
                embedded
                onSubmitted={() => setRefreshTick((n) => n + 1)}
              />
            )}
            {studentTab === "grades" && (
              <StudentClassGrades
                classId={activeClass.id}
                studentEmail={user.email}
                onOpenAssignment={(id) => focusAssignment(id, "assignments")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default SubjectPage;
