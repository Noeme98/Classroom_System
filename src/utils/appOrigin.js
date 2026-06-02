/**
 * Base URL for auth redirects (email confirm, password reset).
 * On a phone, localhost would point at the phone — set VITE_APP_URL to your PC's LAN IP when testing on mobile.
 */
export const getAppOrigin = () => {
  const fromEnv = import.meta.env.VITE_APP_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
};
