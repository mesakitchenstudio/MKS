import { isSitePrivate } from "@/lib/flags";
import {
  ADMIN_COOKIE,
  adminSessionTokenFromCookieHeader,
  hasValidAdminSessionCookie,
  verifySessionToken,
} from "@/lib/admin-session-token";
import { isLiveAdminCookieSession } from "@/lib/admin-auth-sessions";

export { isSitePrivate };

/** Prefer NextRequest cookie jar; fall back to raw Cookie header parsing. */
export function adminSessionTokenFromRequestCookies(
  request: {
    cookies: { get: (name: string) => { value: string } | undefined };
    headers: { get: (name: string) => string | null };
  },
): string | undefined {
  return (
    request.cookies.get(ADMIN_COOKIE)?.value ||
    adminSessionTokenFromCookieHeader(request.headers.get("cookie"))
  );
}

/** Cryptographic cookie presence only — not sufficient for staff preview after revoke. */
export function hasValidAdminSessionFromRequest(
  request: {
    cookies: { get: (name: string) => { value: string } | undefined };
    headers: { get: (name: string) => string | null };
  },
): boolean {
  return Boolean(verifySessionToken(adminSessionTokenFromRequestCookies(request)));
}

/** Live AdminSession + staff identity check for SITE_PRIVATE staff preview. */
export async function hasLiveAdminSessionFromRequest(
  request: {
    cookies: { get: (name: string) => { value: string } | undefined };
    headers: { get: (name: string) => string | null };
  },
): Promise<boolean> {
  const session = verifySessionToken(adminSessionTokenFromRequestCookies(request));
  if (!session) return false;
  return isLiveAdminCookieSession(session);
}

export function isPublicApiWhilePrivate(pathname: string) {
  return (
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/account") ||
    pathname.startsWith("/api/favorites") ||
    pathname.startsWith("/api/newsletter") ||
    pathname.startsWith("/api/contact")
  );
}

/**
 * True when SITE_PRIVATE is on and this request has a LIVE Studio admin session.
 * Crypto-only cookies (revoked / deleted staff) must not unlock the public site.
 */
export function isStaffPublicPreview(cookieHeader: string | null | undefined): boolean {
  // Sync helper kept for call sites that only have a header string; prefer
  // hasLiveAdminSessionFromRequest in proxy. Crypto alone is intentionally
  // insufficient — callers must use the async live check for authorization.
  return isSitePrivate() && hasValidAdminSessionCookie(cookieHeader);
}

/**
 * Visitors (no live admin session) are gated to Coming Soon while private.
 * Pass `liveStaffPreview` from the async live check — do not trust crypto alone.
 */
export function shouldGatePublicRequest(
  cookieHeader: string | null | undefined,
  liveStaffPreview = false,
): boolean {
  if (!isSitePrivate()) return false;
  return !liveStaffPreview;
}

/** Block recipe/content APIs from public access while the site is private.
 * Guest + funnel analytics stay open so anonymous visits are recorded.
 * Only LIVE staff preview can call recipe APIs for QA.
 */
export function isBlockedApiWhilePrivate(
  pathname: string,
  cookieHeader?: string | null,
  liveStaffPreview = false,
) {
  if (!isSitePrivate()) return false;
  if (liveStaffPreview) return false;
  if (isPublicApiWhilePrivate(pathname)) return false;
  if (pathname.startsWith("/api/analytics/guest")) return false;
  if (pathname.startsWith("/api/analytics/events")) return false;
  return pathname.startsWith("/api/recipes");
}
