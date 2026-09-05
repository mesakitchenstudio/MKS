import { isSitePrivate } from "@/lib/flags";
import {
  ADMIN_COOKIE,
  adminSessionTokenFromCookieHeader,
  hasValidAdminSessionCookie,
  verifySessionToken,
} from "@/lib/admin-session-token";

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

export function hasValidAdminSessionFromRequest(
  request: {
    cookies: { get: (name: string) => { value: string } | undefined };
    headers: { get: (name: string) => string | null };
  },
): boolean {
  return Boolean(verifySessionToken(adminSessionTokenFromRequestCookies(request)));
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
 * True when SITE_PRIVATE is on and this request has a valid Studio admin cookie.
 * Used to unlock the full public site for staff QA while visitors stay on Coming Soon.
 */
export function isStaffPublicPreview(cookieHeader: string | null | undefined): boolean {
  return isSitePrivate() && hasValidAdminSessionCookie(cookieHeader);
}

/**
 * Visitors (no admin cookie) are gated to Coming Soon while private.
 * Staff with a valid admin session are not gated.
 */
export function shouldGatePublicRequest(cookieHeader: string | null | undefined): boolean {
  if (!isSitePrivate()) return false;
  return !hasValidAdminSessionCookie(cookieHeader);
}

/** Block recipe/content APIs from public access while the site is private.
 * Guest + funnel analytics stay open so anonymous visits are recorded.
 * Staff preview (valid admin cookie) can call recipe APIs for QA.
 */
export function isBlockedApiWhilePrivate(
  pathname: string,
  cookieHeader?: string | null,
) {
  if (!isSitePrivate()) return false;
  if (hasValidAdminSessionCookie(cookieHeader)) return false;
  if (isPublicApiWhilePrivate(pathname)) return false;
  if (pathname.startsWith("/api/analytics/guest")) return false;
  if (pathname.startsWith("/api/analytics/events")) return false;
  return pathname.startsWith("/api/recipes");
}
