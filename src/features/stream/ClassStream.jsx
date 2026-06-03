import { useEffect, useState } from "react";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementsByClass,
  isAnnouncementsRemoteAvailable,
  syncAnnouncementsByClass,
} from "./announcementUtils";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";
import styles from "./ClassStream.module.css";

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ClassStream({ classId, isTeacher, user, layout = "default" }) {
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const run = async () => {
      if (!classId) return;
      await syncAnnouncementsByClass(classId);
      setRefreshTick((n) => n + 1);
    };
    run();
  }, [classId]);

  useEffect(() => {
    if (!classId || !isSupabaseConfigured) return undefined;
    const channel = supabase
      .channel(`announcements-${classId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements", filter: `class_id=eq.${classId}` },
        async () => {
          await syncAnnouncementsByClass(classId);
          setRefreshTick((n) => n + 1);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [classId]);

  const announcements = getAnnouncementsByClass(classId);
  const localMode = isSupabaseConfigured && !isAnnouncementsRemoteAvailable();

  const handlePost = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await createAnnouncement(classId, body, linkUrl, {
      email: user.email,
      fullName: user.fullName,
    });
    setSaving(false);
    setMessage(result.message);
    setMessageType(result.success ? "success" : "error");
    if (result.success) {
      setBody("");
      setLinkUrl("");
      await syncAnnouncementsByClass(classId);
      setRefreshTick((n) => n + 1);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this announcement?")) return;
    const result = await deleteAnnouncement(id, classId);
    setMessage(result.message);
    setMessageType(result.success ? "success" : "error");
    if (result.success) {
      await syncAnnouncementsByClass(classId);
      setRefreshTick((n) => n + 1);
    }
  };

  const split = layout === "split";

  const composeCard = isTeacher ? (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardHeadTitle}>
          <i className="ti ti-speakerphone" aria-hidden="true" />
          Post an announcement
        </h2>
      </div>
      <form className={styles.cardBody} onSubmit={handlePost}>
        <label className={styles.label} htmlFor="announcement-body">
          Message
        </label>
        <textarea
          id="announcement-body"
          className={styles.textarea}
          rows={3}
          placeholder="Share reminders, links, or updates with your class…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className={styles.label} htmlFor="announcement-link">
          Link (optional)
        </label>
        <input
          id="announcement-link"
          type="url"
          className={styles.input}
          placeholder="https://…"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
        <button type="submit" className={styles.postBtn} disabled={saving}>
          <i className="ti ti-send" aria-hidden="true" />
          {saving ? "Posting…" : "Post announcement"}
        </button>
      </form>
    </section>
  ) : null;

  const listCard = (
    <section className={styles.card} aria-live="polite">
      <div className={styles.cardHead}>
        <h2 className={styles.cardHeadTitle}>
          <i className="ti ti-news" aria-hidden="true" />
          {split ? "Posted announcements" : "Announcements"}
        </h2>
        <span className={styles.countBadge}>{announcements.length}</span>
      </div>
      <div className={styles.cardBody}>
        {localMode && (
          <p className={styles.syncWarn}>
            <i className="ti ti-alert-circle" aria-hidden="true" />
            Announcements are in local mode. Apply the Supabase announcements migration to restore cloud sync.
          </p>
        )}
        {message && (
          <p className={messageType === "success" ? styles.msgSuccess : styles.msgError}>{message}</p>
        )}
        <ul className={styles.list} key={refreshTick}>
          {announcements.length === 0 ? (
            <li className={styles.empty}>
              <div className={styles.emptyIcon}>
                <i className="ti ti-speakerphone" aria-hidden="true" />
              </div>
              <h4>No announcements yet</h4>
              <p>
                {isTeacher
                  ? "Post the first update for your class above."
                  : "Check back for updates from your teacher."}
              </p>
            </li>
          ) : (
            announcements.map((item) => (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.author}>{item.authorName || item.authorEmail}</span>
                  <span className={styles.when}>{formatWhen(item.createdAt)}</span>
                </div>
                <p className={styles.body}>{item.body}</p>
                {item.linkUrl ? (
                  <a
                    className={styles.link}
                    href={item.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open link ↗
                  </a>
                ) : null}
                {isTeacher && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(item.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );

  if (split || layout === "student") {
    return (
      <div className={styles.splitWrap}>
        {layout !== "student" && composeCard}
        {listCard}
      </div>
    );
  }

  return (
    <div className={styles.singleWrap}>
      <section className={styles.legacyCard}>
        <div className={styles.head}>
          <h2 className={styles.title}>Announcements</h2>
          <span className={styles.count}>{announcements.length}</span>
        </div>
        {isTeacher && (
          <form className={styles.compose} onSubmit={handlePost}>
            <label className={styles.label} htmlFor="announcement-body-legacy">
              Announcement
            </label>
            <textarea
              id="announcement-body-legacy"
              className={styles.textarea}
              rows={3}
              placeholder="Share reminders, links, or updates with your class…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <label className={styles.label} htmlFor="announcement-link-legacy">
              Link (optional)
            </label>
            <input
              id="announcement-link-legacy"
              type="url"
              className={styles.input}
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <div className={styles.composeActions}>
              <button type="submit" className={styles.postBtn} disabled={saving}>
                {saving ? "Posting…" : "Post announcement"}
              </button>
            </div>
          </form>
        )}
        {message && (
          <p className={messageType === "success" ? styles.msgSuccess : styles.msgError}>{message}</p>
        )}
        {localMode && (
          <p className={styles.syncWarn}>
            <i className="ti ti-alert-circle" aria-hidden="true" />
            Announcements are in local mode. Apply the Supabase announcements migration to restore cloud sync.
          </p>
        )}
        <ul className={styles.list} key={refreshTick}>
          {announcements.length === 0 ? (
            <li className={styles.empty}>
              {isTeacher
                ? "No announcements yet. Post the first update for your class."
                : "No announcements yet. Check back for updates from your teacher."}
            </li>
          ) : (
            announcements.map((item) => (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.author}>{item.authorName || item.authorEmail}</span>
                  <span className={styles.when}>{formatWhen(item.createdAt)}</span>
                </div>
                <p className={styles.body}>{item.body}</p>
                {item.linkUrl ? (
                  <a
                    className={styles.link}
                    href={item.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open link ↗
                  </a>
                ) : null}
                {isTeacher && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(item.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

export default ClassStream;
