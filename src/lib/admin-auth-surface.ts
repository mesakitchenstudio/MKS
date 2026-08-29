/** Admin routes that must never use the authenticated AdminShell. */
const ADMIN_AUTH_SURFACE_PREFIXES = [
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
] as const;

export function isAdminAuthSurfacePath(pathname: string) {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || pathname;
  return ADMIN_AUTH_SURFACE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
