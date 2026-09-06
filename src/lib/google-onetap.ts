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

/**
 * Optional build-time public env (same value as AUTH_GOOGLE_ID).
 * Prefer the server-passed `clientId` prop so One Tap works when only AUTH_GOOGLE_ID is set.
 */
export function publicGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";
}

/** Resolve GIS client_id: server AUTH_GOOGLE_ID prop first, then NEXT_PUBLIC. */
export function resolveGoogleOneTapClientId(serverClientId?: string | null) {
  const fromServer = serverClientId?.trim() || "";
  if (fromServer) return fromServer;
  return publicGoogleClientId();
}

export function isGoogleOneTapClientConfigured(serverClientId?: string | null) {
  return Boolean(resolveGoogleOneTapClientId(serverClientId));
}

export function isGoogleMemberAuthProvider(provider: string | null | undefined) {
  return provider === "google" || provider === GOOGLE_ONETAP_PROVIDER_ID;
}
