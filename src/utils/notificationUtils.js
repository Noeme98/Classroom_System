import { getItem, setItem } from "./storage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const NOTIFICATIONS_KEY = "notifications";
const DEDUPE_WINDOW_MS = 90 * 1000;

const getAllNotifications = () => {
  const data = getItem(NOTIFICATIONS_KEY);
  return Array.isArray(data) ? data : [];
};

const saveNotifications = (notifications) => {
  setItem(NOTIFICATIONS_KEY, notifications);
  window.dispatchEvent(new Event("notifications:updated"));
};

const toClientNotification = (row) => ({
  id: row.id,
  recipientEmail: null,
  recipientRole: row.recipient_role || null,
  title: row.title,
  body: row.body,
  type: row.type || "info",
  read: Boolean(row.is_read),
  createdAt: row.created_at,
  meta: row.meta || {},
});

const getProfileMapByEmails = async (emails = []) => {
  const uniqueEmails = [...new Set(emails.filter(Boolean))];
  if (uniqueEmails.length === 0) return {};
  const { data, error } = await supabase.from("profiles").select("id, email").in("email", uniqueEmails);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.email, row.id]));
};

const getProfileByEmail = async (email) => {
  if (!email) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const getNotificationsForUser = (user) => {
  if (!user) return [];
  const all = getAllNotifications();
  return all
    .filter((item) => item.recipientEmail === user.email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const getUnreadNotificationCount = (user) =>
  getNotificationsForUser(user).filter((item) => !item.read).length;

const isDuplicateNotification = (existing, candidate) => {
  const ts = new Date(candidate.createdAt).getTime();
  return existing.some((item) => {
    if (item.recipientEmail !== candidate.recipientEmail) return false;
    if (item.title !== candidate.title || item.body !== candidate.body || item.type !== candidate.type) {
      return false;
    }
    const sameMeta = JSON.stringify(item.meta || {}) === JSON.stringify(candidate.meta || {});
    if (!sameMeta) return false;
    const itemTs = new Date(item.createdAt).getTime();
    return Math.abs(ts - itemTs) <= DEDUPE_WINDOW_MS;
  });
};

export const notifyUsers = ({ recipientEmails = [], recipientRole = null, title, body, type = "info", meta = {} }) => {
  void recipientRole;
  if (!recipientEmails || recipientEmails.length === 0) return;

  const now = new Date().toISOString();
  const items = [];
  const uniqueEmails = [...new Set(recipientEmails.filter(Boolean))];

  uniqueEmails.forEach((email) => {
    items.push({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipientEmail: email,
      recipientRole: null,
      title,
      body,
      type,
      read: false,
      createdAt: now,
      meta,
    });
  });

  const existing = getAllNotifications();
  const dedupedItems = items.filter((candidate) => !isDuplicateNotification(existing, candidate));
  const updated = [...dedupedItems, ...existing].slice(0, 300);
  saveNotifications(updated);

  if (isSupabaseConfigured) {
    void (async () => {
      try {
        const profileMap = await getProfileMapByEmails(uniqueEmails);
        const payload = [
          ...uniqueEmails
            .map((email) => {
              const recipientId = profileMap[email];
              if (!recipientId) return null;
              return {
                recipient_id: recipientId,
                recipient_role: null,
                type,
                title,
                body,
                meta,
                is_read: false,
              };
            })
            .filter(Boolean),
        ];
        if (payload.length > 0) {
          await supabase.from("notifications").insert(payload);
        }
      } catch {
        // keep local notifications as fallback
      }
    })();
  }
};

export const markAllNotificationsRead = (user) => {
  if (!user) return;
  const all = getAllNotifications();
  const updated = all.map((item) => {
    const target = item.recipientEmail === user.email;
    return target ? { ...item, read: true } : item;
  });
  saveNotifications(updated);
};

export const markNotificationRead = (notificationId, user) => {
  if (!notificationId || !user) return;
  const all = getAllNotifications();
  const updated = all.map((item) => {
    const isTarget =
      item.id === notificationId &&
      item.recipientEmail === user.email;
    return isTarget ? { ...item, read: true } : item;
  });
  saveNotifications(updated);
};

export const syncNotificationsForUser = async (user) => {
  if (!user) return [];
  if (!isSupabaseConfigured) return getNotificationsForUser(user);
  try {
    const profile = await getProfileByEmail(user.email);
    const profileId = profile?.id || null;
    if (!profileId) return getNotificationsForUser(user);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, recipient_id, recipient_role, type, title, body, meta, is_read, created_at")
      .eq("recipient_id", profileId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    const mapped = (data || []).map(toClientNotification);
    saveNotifications(mapped);
    return mapped;
  } catch {
    return getNotificationsForUser(user);
  }
};

export const markNotificationReadAsync = async (notificationId, user) => {
  markNotificationRead(notificationId, user);
  if (!notificationId || !user || !isSupabaseConfigured) return;
  try {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
  } catch {
    // ignore remote mark failures; local state still updates
  }
};

export const markAllNotificationsReadAsync = async (user) => {
  markAllNotificationsRead(user);
  if (!user || !isSupabaseConfigured) return;
  try {
    const profile = await getProfileByEmail(user.email);
    const profileId = profile?.id || null;
    if (profileId) {
      await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", profileId);
    }
  } catch {
    // ignore remote mark failures; local state still updates
  }
};
