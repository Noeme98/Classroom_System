import { createContext, useEffect, useState } from "react";
import { getItem, setItem, removeItem } from "../utils/storage";
import { getAppOrigin } from "../utils/appOrigin";
import { formatAuthErrorMessage } from "../utils/authErrors";
import { isSupabaseConfigured, supabase } from "../utils/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getItem("user"));
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  const getProfileById = async (id) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("email, role, full_name, bio, avatar_url")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  };

  const upsertProfile = async ({ id, email, role, fullName = null }) => {
    const payload = { id, email, role, full_name: fullName };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw error;
  };

  const reconcileProfileWithAuthMetadata = async (sessionUser) => {
    const metaRaw = sessionUser.user_metadata?.role;
    const metaRole = metaRaw === "teacher" || metaRaw === "student" ? metaRaw : null;
    let profile;
    try {
      profile = await getProfileById(sessionUser.id);
    } catch {
      return { profile: null, metaRole };
    }
    if (metaRole && profile?.role && profile.role !== metaRole) {
      try {
        await upsertProfile({
          id: sessionUser.id,
          email: sessionUser.email,
          role: metaRole,
          fullName: profile.full_name,
        });
        profile = { ...profile, role: metaRole };
      } catch {
        /* keep profile */
      }
    }
    return { profile, metaRole };
  };

  /** Load profile from DB and update stored user (runs in background; do not block auth callbacks). */
  const syncUserFromSession = async (sessionUser, roleFallback = null, fullNameWhenCreating = null) => {
    const meta = sessionUser.user_metadata?.role;
    const fb =
      meta === "teacher" || meta === "student"
        ? meta
        : roleFallback === "teacher" || roleFallback === "student"
          ? roleFallback
          : "student";

    try {
      let { profile: existingProfile, metaRole } = await reconcileProfileWithAuthMetadata(sessionUser);

      if (!existingProfile) {
        const roleForInsert = metaRole || fb;
        try {
          await upsertProfile({
            id: sessionUser.id,
            email: sessionUser.email,
            role: roleForInsert,
            fullName: fullNameWhenCreating,
          });
        } catch {
          /* RLS / network */
        }
        existingProfile = await getProfileById(sessionUser.id).catch(() => null);
      }

      const resolvedFullName =
        existingProfile?.full_name != null && String(existingProfile.full_name).trim() !== ""
          ? existingProfile.full_name
          : fullNameWhenCreating != null && String(fullNameWhenCreating).trim() !== ""
            ? fullNameWhenCreating
            : "";

      const userData = {
        email: sessionUser.email,
        role: existingProfile?.role || metaRole || fb,
        fullName: resolvedFullName,
        bio: existingProfile?.bio != null ? String(existingProfile.bio) : "",
        avatarUrl:
          existingProfile?.avatar_url != null ? String(existingProfile.avatar_url).trim() : "",
      };
      setItem("user", userData);
      setUser(userData);
    } catch {
      /* keep existing user state */
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    let mounted = true;

    const applySessionUser = async (sessionUser) => {
      if (!sessionUser) {
        if (mounted) {
          removeItem("user");
          setUser(null);
        }
        return;
      }

      try {
        await syncUserFromSession(sessionUser, null);
      } catch {
        const meta = sessionUser.user_metadata?.role;
        const role = meta === "teacher" || meta === "student" ? meta : "student";
        const fallback = { email: sessionUser.email, role, fullName: "", bio: "", avatarUrl: "" };
        if (mounted) {
          setItem("user", fallback);
          setUser(fallback);
        }
      }
    };

    // Single auth listener (includes INITIAL_SESSION) — avoids duplicate getSession() lock contention.
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      void (async () => {
        await applySessionUser(session?.user ?? null);
        if (mounted) setAuthLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authSub?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return { success: false, message: "Please enter your email and password." };
    }

    if (!isSupabaseConfigured) {
      const userData = { email: normalizedEmail, role: "student", fullName: "", bio: "", avatarUrl: "" };
      setItem("user", userData);
      setUser(userData);
      return { success: true };
    }

    let data;
    let error;
    try {
      const result = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      data = result.data;
      error = result.error;
    } catch (e) {
      return { success: false, message: formatAuthErrorMessage(String(e?.message || ""), e) };
    }

    if (error) {
      const message = String(error.message || "");
      if (message.toLowerCase().includes("email not confirmed")) {
        return {
          success: false,
          message:
            "This account is not verified yet. Either confirm the email link Supabase sent, or ask your admin to turn off “Confirm email” under Authentication → Providers → Email for instant access.",
        };
      }
      return { success: false, message: formatAuthErrorMessage(error.message, error) };
    }

    const sessionUser = data?.user;
    if (!sessionUser) return { success: false, message: "Unable to create session." };

    const metaRole = sessionUser.user_metadata?.role;
    const roleFromSignup =
      metaRole === "teacher" || metaRole === "student" ? metaRole : "student";

    const optimisticUser = {
      email: sessionUser.email,
      role: roleFromSignup,
      fullName: "",
      bio: "",
      avatarUrl: "",
    };
    setItem("user", optimisticUser);
    setUser(optimisticUser);
    setAuthLoading(false);

    return { success: true };
  };

  const signup = async ({ email, password, role, fullName = "" }) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const safeRole = role === "teacher" ? "teacher" : role === "student" ? "student" : "";
    const safeFullName = String(fullName || "").trim();
    if (!normalizedEmail || !password || !safeRole) {
      return { success: false, message: "Please complete all required fields." };
    }
    if (password.length < 8) {
      return { success: false, message: "Password must be at least 8 characters long." };
    }

    if (!isSupabaseConfigured) {
      const userData = {
        email: normalizedEmail,
        role: safeRole,
        fullName: safeFullName,
        bio: "",
        avatarUrl: "",
      };
      setItem("user", userData);
      setUser(userData);
      return { success: true };
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${getAppOrigin()}/login`,
        data: {
          role: safeRole,
          full_name: safeFullName || "",
        },
      },
    });
    if (error) return { success: false, message: formatAuthErrorMessage(error.message, error) };

    let sessionUser = data?.user || null;
    let session = data?.session || null;

    // If the project does not return a session from signUp (e.g. "Confirm email" still on),
    // try password sign-in once — succeeds when email confirmation is disabled or user already confirmed.
    if (!session && sessionUser) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (!signInError && signInData?.session && signInData?.user) {
        session = signInData.session;
        sessionUser = signInData.user;
      }
    }

    if (session && sessionUser) {
      await syncUserFromSession(sessionUser, safeRole, safeFullName);
      setAuthLoading(false);
      return { success: true };
    }

    return {
      success: false,
      message:
        "Could not sign you in right after signup. In the Supabase Dashboard, open Authentication → Providers → Email and turn off “Confirm email”, then try again.",
    };
  };

  const requestPasswordReset = async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return { success: false, message: "Please enter your email address." };
    }
    if (!isSupabaseConfigured) {
      return {
        success: false,
        message: "Password reset requires Supabase configuration.",
      };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${getAppOrigin()}/reset-password`,
    });
    if (error) return { success: false, message: formatAuthErrorMessage(error.message, error) };
    return {
      success: true,
      message: "Password reset email sent. Please check your inbox.",
    };
  };

  const updatePassword = async (newPassword) => {
    const password = String(newPassword || "");
    if (password.length < 8) {
      return { success: false, message: "Password must be at least 8 characters long." };
    }
    if (!isSupabaseConfigured) {
      return {
        success: false,
        message: "Password update requires Supabase configuration.",
      };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: formatAuthErrorMessage(error.message, error) };
    return { success: true, message: "Password updated successfully. You can now log in." };
  };

  const uploadProfileAvatar = async (file) => {
    if (!file) {
      return { success: false, message: "No file selected." };
    }
    const mime = String(file.type || "").toLowerCase();
    const allowed = /^image\/(jpeg|png|webp|gif)$/i.test(mime);
    if (!allowed) {
      return { success: false, message: "Use a JPEG, PNG, WebP, or GIF image." };
    }
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      return { success: false, message: "Image must be 2 MB or smaller." };
    }

    if (!isSupabaseConfigured) {
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          if (dataUrl.length > 450_000) {
            resolve({ success: false, message: "Image is too large for offline mode. Try a smaller file." });
            return;
          }
          resolve({ success: true, publicUrl: dataUrl });
        };
        reader.onerror = () => resolve({ success: false, message: "Could not read the file." });
        reader.readAsDataURL(file);
      });
    }

    const {
      data: { user: authUser },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !authUser) {
      return { success: false, message: userErr?.message || "Not signed in." };
    }

    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "jpg";
    const objectPath = `${authUser.id}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage.from("avatars").upload(objectPath, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (upErr) {
      return { success: false, message: formatAuthErrorMessage(upErr.message, upErr) };
    }

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return { success: false, message: "Could not get a public URL for the upload." };
    }
    return { success: true, publicUrl };
  };

  const updateProfile = async ({ fullName, bio, avatarUrl }) => {
    const name = String(fullName ?? "").trim();
    const bioText = String(bio ?? "").trim();
    const avatar = String(avatarUrl ?? "").trim();
    if (avatar) {
      const isHttp = /^https?:\/\//i.test(avatar);
      const isData = /^data:image\//i.test(avatar);
      if (isSupabaseConfigured && isData) {
        return {
          success: false,
          message: "Uploaded photos are stored automatically. Paste an https:// image link, or use click-to-upload.",
        };
      }
      if (!isHttp && !isData) {
        return { success: false, message: "Photo must be an https link or an uploaded image." };
      }
    }
    if (bioText.length > 2000) {
      return { success: false, message: "Bio is too long (max 2000 characters)." };
    }
    if (name.length > 120) {
      return { success: false, message: "Display name is too long (max 120 characters)." };
    }

    if (!isSupabaseConfigured) {
      const prev = getItem("user") || {};
      const next = {
        ...prev,
        fullName: name,
        bio: bioText,
        avatarUrl: avatar,
      };
      setItem("user", next);
      setUser(next);
      return { success: true };
    }

    const {
      data: { user: authUser },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !authUser) {
      return { success: false, message: userErr?.message || "Not signed in." };
    }

    const row = {
      full_name: name || null,
      bio: bioText || null,
      avatar_url: avatar || null,
    };

    let existing = null;
    try {
      existing = await getProfileById(authUser.id);
    } catch {
      /* ignore */
    }

    const writeRes = !existing
      ? await supabase.from("profiles").upsert(
          {
            id: authUser.id,
            email: authUser.email,
            role:
              authUser.user_metadata?.role === "teacher" ||
              authUser.user_metadata?.role === "student"
                ? authUser.user_metadata.role
                : "student",
            ...row,
          },
          { onConflict: "id" }
        )
      : await supabase.from("profiles").update(row).eq("id", authUser.id);
    if (writeRes.error) {
      return { success: false, message: formatAuthErrorMessage(writeRes.error.message, writeRes.error) };
    }

    await supabase.auth.updateUser({
      data: { full_name: name || "" },
    }).catch(() => {});

    let profile = null;
    try {
      profile = await getProfileById(authUser.id);
    } catch {
      /* ignore */
    }
    const meta = authUser.user_metadata?.role;
    const role =
      profile?.role || (meta === "teacher" || meta === "student" ? meta : "student");
    const userData = {
      email: profile?.email || authUser.email || "",
      role,
      fullName:
        profile?.full_name != null && String(profile.full_name).trim() !== ""
          ? String(profile.full_name).trim()
          : name,
      bio: profile?.bio != null ? String(profile.bio) : bioText,
      avatarUrl:
        profile?.avatar_url != null ? String(profile.avatar_url).trim() : avatar,
    };
    setItem("user", userData);
    setUser(userData);
    return { success: true };
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        authLoading,
        requestPasswordReset,
        updatePassword,
        updateProfile,
        uploadProfileAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
