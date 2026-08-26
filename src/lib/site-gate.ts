import { isSitePrivate } from "@/lib/flags";

export { isSitePrivate };

export function isPublicApiWhilePrivate(pathname: string) {
  return (
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/account") ||
    pathname.startsWith("/api/favorites")
  );
}

/** Block recipe/content APIs from public access while the site is private. */
export function isBlockedApiWhilePrivate(pathname: string) {
  if (!isSitePrivate()) return false;
  if (isPublicApiWhilePrivate(pathname)) return false;
  return (
    pathname.startsWith("/api/recipes") ||
    pathname.startsWith("/api/analytics/guest")
  );
}
