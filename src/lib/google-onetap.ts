/**
 * Path eligibility for Google One Tap / FedCM prompts on the public site.
 * Browser/Google still decide whether a prompt is shown.
 */

/** Auth.js Credentials provider id for Google One Tap ID tokens. */
export const GOOGLE_ONETAP_PROVIDER_ID = "google-onetap";

export function isGoogleOneTapPathEligible(pathname: string) {
  const path = (pathname || "/").split("?")[0] || "/";

  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/auth/")) return false;
  if (path.startsWith("/newsletter/unsubscribe")) return false;
  if (path === "/forgot-password" || path.startsWith("/forgot-password/")) return false;
  if (path === "/reset-password" || path.startsWith("/reset-password/")) return false;
  if (path === "/coming-soon" || path.startsWith("/coming-soon/")) return false;

  return true;
}

/** Public GIS client ID (same Web OAuth client as AUTH_GOOGLE_ID). */
export function publicGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";
}

export function isGoogleOneTapClientConfigured() {
  return Boolean(publicGoogleClientId());
}

export function isGoogleMemberAuthProvider(provider: string | null | undefined) {
  return provider === "google" || provider === GOOGLE_ONETAP_PROVIDER_ID;
}
