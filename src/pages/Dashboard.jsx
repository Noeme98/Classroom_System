import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import TeacherView from "../features/teacher/TeacherView";
import StudentView from "../features/student/StudentView";
import ProfilePanel from "../features/profile/ProfilePanel";
import { getClasses } from "../features/teacher/teacherUtils";
import { getJoinedClasses } from "../features/student/studentUtils";
import { getItem } from "../utils/storage";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationReadAsync,
  markAllNotificationsReadAsync,
  syncNotificationsForUser,
} from "../utils/notificationUtils";
import { syncDueDateReminders, syncTeacherGradingReminders } from "../utils/dueReminderUtils";
import { buildClassUrl } from "../utils/classNavigation";
import { isValidUuid } from "../utils/uuid";
import AuthenticatedShell from "../components/AuthenticatedShell";
import styles from "./Dashboard.module.css";

const TEACHER_NAV = [
  { id: "overview", label: "Overview", icon: "🏠", section: "overview", group: "Main", badgeKey: "pending" },
  { id: "classes", label: "My classes", icon: "📚", section: "classes", group: "Main" },
  { id: "profile", label: "My profile", icon: "👤", section: "profile", group: "Account" },
];

const STUDENT_NAV = [
  { id: "overview", label: "Overview", icon: "🏠", section: "overview", group: "Main", badgeKey: "pending" },
  { id: "classes", label: "My classes", icon: "📚", section: "classes", group: "Main" },
  { id: "grades", label: "My grades", icon: "📋", section: "grades", group: "Grades" },
  { id: "profile", label: "My profile", icon: "👤", section: "profile", group: "Account" },
];

function Dashboard() {
  const { user, logout, authLoading } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [section, setSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarAvatarBroken, setSidebarAvatarBroken] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setSidebarAvatarBroken(false));
  }, [user?.avatarUrl]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const syncNotifications = async () => {
      await syncNotificationsForUser(user);
      syncDueDateReminders(user);
      syncTeacherGradingReminders(user);
      setNotifications(getNotificationsForUser(user));
      setUnreadCount(getUnreadNotificationCount(user));
    };
    void syncNotifications();
    window.addEventListener("notifications:updated", syncNotifications);
    const pollId = window.setInterval(syncNotifications, 20000);
    return () => {
      window.removeEventListener("notifications:updated", syncNotifications);
      window.clearInterval(pollId);
    };
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const navCounts = useMemo(() => {
    const assignments = getItem("assignments") || [];
    const submissions = getItem("submissions") || [];
    if (!user) {
      return { teacherPending: 0, studentPending: 0 };
    }
    if (user.role === "teacher") {
      const classes = getClasses();
      const pending = submissions.filter(
        (s) => classes.some((c) => String(c.id) === String(s.classId)) && s.grade === null
      ).length;
      return { teacherPending: pending, studentPending: 0 };
    }
    const joined = getJoinedClasses();
    const total = joined.reduce(
      (n, cls) => n + assignments.filter((a) => String(a.classId) === String(cls.id)).length,
      0
    );
    const done = submissions.filter(
      (s) => s.studentEmail === user.email && joined.some((c) => String(c.id) === String(s.classId))
    ).length;
    return {
      teacherPending: 0,
      studentPending: Math.max(total - done, 0),
    };
  }, [user, notifications]);

  // Wait only until we know who is signed in — do not block on authLoading once `user` exists
  // (otherwise a slow profiles bootstrap + login races leave you stuck on this spinner forever).
  if (!user) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading your dashboard...</p>
      </div>
    );
  }

  const isTeacher = user.role === "teacher";
  const navItems = isTeacher ? TEACHER_NAV : STUDENT_NAV;

  useEffect(() => {
    const allowed = (isTeacher ? TEACHER_NAV : STUDENT_NAV).map((item) => item.section);
    if (!allowed.includes(section)) {
      setSection("overview");
    }
  }, [section, isTeacher]);

  const topTitle =
    navItems.find((item) => item.section === section)?.label ||
    (isTeacher ? "Teacher" : "Student") + " dashboard";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsReadAsync(user);
    setShowNotifications(true);
  };

  const handleNotificationOpen = async (item) => {
    await markNotificationReadAsync(item.id, user);
    setShowNotifications(false);
    const classId = item?.meta?.classId;
    const assignmentId = item?.meta?.assignmentId;
    const safeAssignment =
      assignmentId && isValidUuid(String(assignmentId)) ? assignmentId : undefined;

    if (classId) {
      navigate(buildClassUrl(classId, safeAssignment));
      return;
    }

    if (user.role === "teacher" && item.type === "assignment") {
      setSection("overview");
      return;
    }

    if (user.role === "student" && item.type === "grade") {
      setSection("grades");
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (notificationFilter === "all") return true;
    if (notificationFilter === "unread") return !item.read;
    return item.type === notificationFilter;
  });

  const displayName = user.fullName?.trim() || user.email?.split("@")[0] || "User";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || user.email?.slice(0, 2).toUpperCase() || "?";

  const avatarSrc = user.avatarUrl?.trim();
  const showSidebarPhoto =
    Boolean(avatarSrc) &&
    (/^https?:\/\//i.test(avatarSrc || "") || /^data:image\//i.test(avatarSrc || "")) &&
    !sidebarAvatarBroken;

  const selectNav = (next) => {
    setSection(next);
    setSidebarOpen(false);
  };

  const badgeFor = (item) => {
    if (!item.badgeKey) return null;
    if (item.badgeKey === "pending") {
      const n = isTeacher ? navCounts.teacherPending : navCounts.studentPending;
      return n > 0 ? n : null;
    }
    return null;
  };

  const navItemsRendered = navItems.map((item, index) => {
    const showGroupLabel = index === 0 || navItems[index - 1].group !== item.group;
    const badge = badgeFor(item);
    return (
      <Fragment key={item.id}>
        {showGroupLabel && <div className={styles.navLabel}>{item.group}</div>}
        <button
          type="button"
          className={`${styles.navBtn} ${section === item.section ? styles.navBtnActive : ""}`}
          onClick={() => selectNav(item.section)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          {item.label}
          {badge != null && <span className={styles.navBadge}>{badge > 99 ? "99+" : badge}</span>}
        </button>
      </Fragment>
    );
  });

  return (
    <AuthenticatedShell>
    <div className={`${styles.page} ${styles.shellLayout}`}>
      {sidebarOpen && (
        <button
          type="button"
          className={styles.sidebarOverlay}
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={styles.shell}>
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sidebarHeader}>
            <div className={styles.brandIcon}>
              <i className="ti ti-school" aria-hidden="true" />
            </div>
            <div className={styles.brandText}>
              Class<span className={styles.brandAccent}>XP</span>
            </div>
          </div>

          <div className={styles.sidebarUser}>
            {showSidebarPhoto ? (
              <img
                src={avatarSrc}
                alt=""
                className={`${styles.avatar} ${styles.avatarPhoto} ${
                  isTeacher ? styles.avatarTeacher : styles.avatarStudent
                }`}
                onError={() => setSidebarAvatarBroken(true)}
              />
            ) : (
              <div className={`${styles.avatar} ${isTeacher ? styles.avatarTeacher : styles.avatarStudent}`}>
                {initials}
              </div>
            )}
            <div className={styles.userInfo}>
              <div className={styles.userName}>{displayName}</div>
              <div className={`${styles.userRole} ${isTeacher ? styles.roleTeacher : styles.roleStudent}`}>
                {isTeacher ? "Teacher" : "Student"}
              </div>
            </div>
          </div>

          <nav className={styles.navScroll} aria-label="Main navigation">
            {navItemsRendered}
          </nav>

          <div className={styles.sidebarFoot}>
            <button type="button" className={styles.logoutNav} onClick={handleLogout}>
              <i className="ti ti-logout" aria-hidden="true" />
              Logout
            </button>
          </div>
        </aside>

        <div className={styles.mainCol}>
          <header className={styles.topbar}>
            <div className={styles.topbarLeft}>
              <button
                type="button"
                className={styles.menuBtn}
                aria-label="Open menu"
                onClick={() => setSidebarOpen(true)}
              >
                ☰
              </button>
              <span className={styles.topbarTitle}>{topTitle}</span>
            </div>
            <div className={styles.topbarRight}>
              <button
                type="button"
                className={styles.themeToggle}
                onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              >
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <div className={styles.notificationWrap}>
                <button
                  type="button"
                  className={styles.notificationBtn}
                  onClick={() => setShowNotifications((prev) => !prev)}
                  aria-label="Notifications"
                >
                  <i className="ti ti-bell" aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span className={styles.notificationCount}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className={styles.notificationPanel}>
                    <div className={styles.notificationHead}>
                      <span>Notifications</span>
                      <button type="button" className={styles.readAllBtn} onClick={handleMarkAllRead}>
                        Mark all read
                      </button>
                    </div>
                    <div className={styles.notificationFilters}>
                      {[
                        { id: "all", label: "All" },
                        { id: "unread", label: "Unread" },
                        { id: "assignment", label: "Assignments" },
                        { id: "grade", label: "Grades" },
                      ].map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          className={`${styles.filterChip} ${
                            notificationFilter === filter.id ? styles.filterChipActive : ""
                          }`}
                          onClick={() => setNotificationFilter(filter.id)}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    {filteredNotifications.length === 0 ? (
                      <p className={styles.notificationEmpty}>No notifications yet.</p>
                    ) : (
                      <ul className={styles.notificationList}>
                        {filteredNotifications.slice(0, 8).map((item) => (
                          <li
                            key={item.id}
                            className={`${styles.notificationItem} ${item.read ? "" : styles.notificationUnread}`}
                          >
                            <button
                              type="button"
                              className={styles.notificationLink}
                              onClick={() => handleNotificationOpen(item)}
                            >
                              <p className={styles.notificationTitle}>{item.title}</p>
                              <p className={styles.notificationBody}>{item.body}</p>
                              <span className={styles.notificationTime}>
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className={styles.shellContent}>
            {section === "profile" ? (
              <ProfilePanel />
            ) : isTeacher ? (
              <TeacherView section={section} />
            ) : (
              <StudentView section={section} />
            )}
          </div>
        </div>
      </div>
    </div>
    </AuthenticatedShell>
  );
}

export default Dashboard;
