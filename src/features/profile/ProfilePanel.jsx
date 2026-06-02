import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { isSupabaseConfigured } from "../../utils/supabaseClient";
import styles from "./ProfilePanel.module.css";

function isRenderableImageUrl(url) {
  const u = String(url || "").trim();
  return u && (/^https?:\/\//i.test(u) || /^data:image\//i.test(u));
}

function ProfilePanel() {
  const { user, updateProfile, uploadProfileAvatar } = useAuth();
  const fileInputRef = useRef(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewPhotoError, setPreviewPhotoError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => {
      setFullName(user.fullName?.trim() || "");
      setAvatarUrl(user.avatarUrl?.trim() || "");
      setPreviewPhotoError(false);
      setMessage(null);
    });
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    const result = await updateProfile({ fullName, avatarUrl });
    setSaving(false);
    if (!result?.success) {
      setMessage({ kind: "error", text: result?.message || "Could not save profile." });
      return;
    }
    setMessage({ kind: "success", text: "Profile saved." });
  };

  const handleAvatarButtonClick = () => {
    setMessage(null);
    fileInputRef.current?.click();
  };

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setMessage(null);
    setUploadingPhoto(true);
    const up = await uploadProfileAvatar(file);
    setUploadingPhoto(false);

    if (!up?.success) {
      setMessage({ kind: "error", text: up?.message || "Upload failed." });
      return;
    }

    setAvatarUrl(up.publicUrl);
    setPreviewPhotoError(false);

    setSaving(true);
    const save = await updateProfile({ fullName, avatarUrl: up.publicUrl });
    setSaving(false);
    if (!save?.success) {
      setMessage({ kind: "error", text: save?.message || "Photo uploaded but profile could not be saved." });
      return;
    }
    setMessage({ kind: "success", text: "Photo updated and saved." });
  };

  const displayName = user?.fullName?.trim() || user?.email?.split("@")[0] || "User";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  const isTeacher = user?.role === "teacher";
  const showPreviewImg = isRenderableImageUrl(avatarUrl) && !previewPhotoError;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>My profile</h1>
        <p className={styles.lead}>
          Update how you appear in ClassXP. Your email and role come from your account and cannot be changed
          here.
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.preview}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className={styles.hiddenFile}
            aria-hidden
            tabIndex={-1}
            onChange={handleAvatarFile}
          />
          <button
            type="button"
            className={`${styles.avatarButton} ${isTeacher ? styles.previewTeacher : styles.previewStudent}`}
            onClick={handleAvatarButtonClick}
            disabled={uploadingPhoto || saving}
            aria-label="Upload profile photo"
            title="Click to upload a photo"
          >
            {uploadingPhoto && <span className={styles.avatarBusy}>…</span>}
            {!uploadingPhoto && showPreviewImg ? (
              <img
                src={avatarUrl.trim()}
                alt=""
                className={styles.previewImg}
                onError={() => setPreviewPhotoError(true)}
              />
            ) : (
              !uploadingPhoto && <span className={styles.avatarInitials}>{initials || "?"}</span>
            )}
            <span className={styles.avatarHint}>📷</span>
          </button>
          <div>
            <div className={styles.previewName}>{fullName.trim() || displayName}</div>
            <div className={styles.previewMeta}>{user?.email}</div>
            <div className={`${styles.previewRole} ${isTeacher ? styles.roleTeacher : styles.roleStudent}`}>
              {isTeacher ? "Teacher" : "Student"}
            </div>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="profile-full-name">Display name</label>
            <input
              id="profile-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name as shown in the app"
              maxLength={120}
              autoComplete="name"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={user?.email || ""} disabled className={styles.inputMuted} />
          </div>

          {!isSupabaseConfigured && (
            <p className={styles.notice}>
              Supabase is not configured — uploads use this browser only (data URL). Add Storage + run{" "}
              <code className={styles.code}>schema.sql</code> for hosted photos.
            </p>
          )}

          {message && (
            <p className={message.kind === "error" ? styles.msgError : styles.msgSuccess} role="status">
              {message.text}
            </p>
          )}

          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving || uploadingPhoto}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfilePanel;
