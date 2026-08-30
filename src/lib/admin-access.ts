export const ACCESS_LEVELS = [
  {
    id: "owner",
    label: "Owner",
    help: "Full access to Mesa, including staff and settings.",
  },
  {
    id: "editor",
    label: "Editor",
    help: "Can create and manage recipes, types, and categories.",
  },
  {
    id: "members",
    label: "Audience",
    help: "Can view member and visitor information only.",
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
  if (area === "youtube") return role === "editor" || role === "members";
  return false;
}

/** Manual YouTube sync is owner-only; reports are visible to editors and Audience. */
export function canManageYoutubeSync(role: string) {
  return role === "owner";
}

export function homeForRole(role: string) {
  if (role === "members") return "/admin/members";
  if (role === "editor" || role === "owner") return "/admin";
  return "/admin/login";
}
