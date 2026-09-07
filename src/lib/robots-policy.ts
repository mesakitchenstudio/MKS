/**
 * Canonical robots policy — shared by `src/app/robots.ts` and Site Health.
 * Robots is not an authorization boundary; server auth still protects Admin/API.
 */

export const ROBOTS_PRIVATE_ALLOW = [
  "/favicon.ico",
  "/favicon.png",
  "/icon.png",
  "/apple-icon.png",
  "/icon.svg",
] as const;

export const ROBOTS_PUBLIC_DISALLOW_ALWAYS = [
  "/admin",
  "/admin/",
  "/api/",
  "/profile",
  "/auth/",
  "/coming-soon",
] as const;

export function publicRobotsDisallow(studioPublicLaunchEnabled: boolean): string[] {
  return [
    ...ROBOTS_PUBLIC_DISALLOW_ALWAYS,
    ...(studioPublicLaunchEnabled ? [] : ["/studio", "/studio/"]),
  ];
}

export function robotsDisallowsAdmin(disallow: readonly string[]): boolean {
  return disallow.some((rule) => rule === "/admin" || rule === "/admin/");
}

export function robotsDisallowsProfile(disallow: readonly string[]): boolean {
  return disallow.some((rule) => rule === "/profile" || rule.startsWith("/profile"));
}

export function robotsDisallowsApi(disallow: readonly string[]): boolean {
  return disallow.some((rule) => rule === "/api/" || rule === "/api");
}
