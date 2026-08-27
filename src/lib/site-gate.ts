import { isSitePrivate } from "@/lib/flags";

export { isSitePrivate };

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

/** Block recipe/content APIs from public access while the site is private.
 * Guest analytics stay open so anonymous Coming Soon visits are recorded.
 */
export function isBlockedApiWhilePrivate(pathname: string) {
  if (!isSitePrivate()) return false;
  if (isPublicApiWhilePrivate(pathname)) return false;
  if (pathname.startsWith("/api/analytics/guest")) return false;
  return pathname.startsWith("/api/recipes");
}
