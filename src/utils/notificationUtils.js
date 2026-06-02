import { getItem, setItem } from "./storage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const NOTIFICATIONS_KEY = "notifications";

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
    .filter(
      (item) =>
        item.recipientEmail === user.email ||
        (item.recipientRole && item.recipientRole === user.role)
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const getUnreadNotificationCount = (user) =>
  getNotificationsForUser(user).filter((item) => !item.read).length;

export const notifyUsers = ({ recipientEmails = [], recipientRole = null, title, body, type = "info", meta = {} }) => {
  if ((!recipientEmails || recipientEmails.length === 0) && !recipientRole) return;

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

  if (recipientRole) {
    items.push({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipientEmail: null,
      recipientRole,
      title,
      body,
      type,
      read: false,
      createdAt: now,
      meta,
    });
  }

  const existing = getAllNotifications();
  const updated = [...items, ...existing].slice(0, 300);
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
          ...(recipientRole
            ? [
                {
                  recipient_id: null,
                  recipient_role: recipientRole,
                  type,
                  title,
                  body,
                  meta,
                  is_read: false,
                },
              ]
            : []),
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
    const target =
      item.recipientEmail === user.email ||
      (item.recipientRole && item.recipientRole === user.role);
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
      (item.recipientEmail === user.email ||
        (item.recipientRole && item.recipientRole === user.role));
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
    const { data, error } = await supabase
      .from("notifications")
      .select("id, recipient_id, recipient_role, type, title, body, meta, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    const filtered = (data || []).filter((row) => {
      const forUser = profileId && row.recipient_id === profileId;
      const forRole = row.recipient_role && row.recipient_role === user.role;
      return Boolean(forUser || forRole);
    });
    const mapped = filtered.map(toClientNotification);
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
    let query = supabase.from("notifications").update({ is_read: true }).eq("recipient_role", user.role);
    if (profileId) {
      await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", profileId);
    }
    await query;
  } catch {
    // ignore remote mark failures; local state still updates
  }
};
