export const ACCESS_LEVELS = [
  {
    id: "owner",
    label: "Owner",
    help: "Full admin access, including Team access.",
  },
  {
    id: "editor",
    label: "Editor",
    help: "Publishing, library, reviews, and YouTube.",
  },
  {
    id: "members",
    label: "Audience",
    help: "Members and Visitors only.",
  },
] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number]["id"];
export type AdminArea = "content" | "members" | "staff" | "youtube";

export function isAccessLevel(value: string): value is AccessLevel {
  return ACCESS_LEVELS.some((level) => level.id === value);
}

export function accessLabel(role: string) {
  return ACCESS_LEVELS.find((level) => level.id === role)?.label ?? role;
}

export function canAccess(role: string, area: AdminArea) {
  if (role === "owner") return true;
  if (area === "content") return role === "editor";
  if (area === "members") return role === "members";
  if (area === "youtube") return role === "editor";
  return false;
}

/** YouTube admin dashboard: owner + editor only; Audience has no access. */
export function canManageYoutubeSync(role: string) {
  return role === "owner";
}

/** Connect / disconnect / refresh YouTube Analytics OAuth is owner-only. */
export function canManageYoutubeAnalytics(role: string) {
  return role === "owner";
}

/**
 * Raw visitor network diagnostics (IP lookup, UA, ASN/ISP, map).
 * Owner only — Audience may view behavioral Visitors analytics without raw network data.
 */
export function canViewGuestNetworkDiagnostics(role: string) {
  return role === "owner";
}

/**
 * Destructive guest visitor deletion (single + bulk).
 * Owner only — Audience is view-only for Visitors.
 */
export function canDeleteGuestVisitors(role: string) {
  return role === "owner";
}

/**
 * Destructive member account deletion (single + bulk).
 * Owner only — Audience may view Members without remove controls.
 */
export function canDeleteMembers(role: string) {
  return role === "owner";
}

export function homeForRole(role: string) {
  if (role === "members") return "/admin/members";
  if (role === "editor" || role === "owner") return "/admin";
  return "/admin/login";
}
