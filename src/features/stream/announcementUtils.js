import { getItem, setItem } from "../../utils/storage";
import { notifyUsers } from "../../utils/notificationUtils";
import { isSupabaseConfigured, supabase } from "../../utils/supabaseClient";

const ANNOUNCEMENTS_KEY = "announcements";
const makeId = () => "ann_" + Math.random().toString(36).slice(2, 10);

export function getAnnouncements() {
  return getItem(ANNOUNCEMENTS_KEY) || [];
}

function saveAnnouncements(items) {
  setItem(ANNOUNCEMENTS_KEY, items);
}

const toClientAnnouncement = (row, profile) => ({
  id: row.id,
  classId: row.class_id,
  authorEmail: profile?.email || row.author_email || "",
  authorName: profile?.full_name || profile?.email || row.author_email || "Teacher",
  body: row.body,
  linkUrl: row.link_url || "",
  createdAt: row.created_at,
});

export function getAnnouncementsByClass(classId) {
  return getAnnouncements()
    .filter((a) => String(a.classId) === String(classId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function syncAnnouncementsByClass(classId) {
  if (!classId || !isSupabaseConfigured) return getAnnouncementsByClass(classId);

  try {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, class_id, author_id, body, link_url, created_at, profiles:author_id(email, full_name)")
      .eq("class_id", classId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const synced = (data || []).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return toClientAnnouncement(row, profile);
    });
    const current = getAnnouncements();
    const others = current.filter((a) => String(a.classId) !== String(classId));
    saveAnnouncements([...others, ...synced]);
    return synced;
  } catch {
    return getAnnouncementsByClass(classId);
  }
}

export async function createAnnouncement(classId, body, linkUrl, author) {
  const trimmedBody = String(body || "").trim();
  if (!classId || !trimmedBody) {
    return { success: false, message: "Write an announcement before posting." };
  }
  if (!author?.email) {
    return { success: false, message: "You must be signed in to post." };
  }

  const link = String(linkUrl || "").trim();
  let created;

  if (isSupabaseConfigured) {
    try {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", author.email)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile?.id) {
        return { success: false, message: "Profile not found. Try logging in again." };
      }

      const { data, error } = await supabase
        .from("announcements")
        .insert({
          class_id: classId,
          author_id: profile.id,
          body: trimmedBody,
          link_url: link || null,
        })
        .select("id, class_id, author_id, body, link_url, created_at")
        .single();
      if (error) throw error;

      created = {
        id: data.id,
        classId: data.class_id,
        authorEmail: author.email,
        authorName: author.fullName || author.email,
        body: data.body,
        linkUrl: data.link_url || "",
        createdAt: data.created_at,
      };
    } catch (err) {
      return { success: false, message: err.message || "Failed to post announcement." };
    }
  } else {
    created = {
      id: makeId(),
      classId,
      authorEmail: author.email,
      authorName: author.fullName || author.email,
      body: trimmedBody,
      linkUrl: link,
      createdAt: new Date().toISOString(),
    };
  }

  saveAnnouncements([...getAnnouncements(), created]);

  const classes = getItem("classes") || [];
  const classStudents = getItem("classStudents") || {};
  const className = classes.find((c) => String(c.id) === String(classId))?.name || "your class";
  const recipients = classStudents[String(classId)] || [];

  notifyUsers({
    recipientEmails: recipients,
    title: "New class announcement",
    body: `${author.fullName || author.email} posted in ${className}.`,
    type: "info",
    meta: { classId, announcementId: created.id },
  });

  return { success: true, message: "Announcement posted!", announcement: created };
}

export async function deleteAnnouncement(announcementId, classId) {
  if (!announcementId) return { success: false, message: "Nothing to delete." };

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
      if (error) throw error;
    } catch (err) {
      return { success: false, message: err.message || "Failed to delete announcement." };
    }
  }

  saveAnnouncements(getAnnouncements().filter((a) => a.id !== announcementId));
  return { success: true, message: "Announcement removed." };
}
