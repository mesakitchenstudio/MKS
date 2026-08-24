export const ACCESS_LEVELS = [
  {
    id: "owner",
    label: "Owner",
    help: "Full access, including adding and removing admins.",
  },
  {
    id: "editor",
    label: "Editor",
    help: "Recipes, types, and categories only.",
  },
  {
    id: "members",
    label: "Members",
    help: "Member analytics only.",
  },
] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number]["id"];
export type AdminArea = "content" | "members" | "staff";

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
  return false;
}

export function homeForRole(role: string) {
  if (role === "members") return "/admin/members";
  if (role === "editor" || role === "owner") return "/admin";
  return "/admin/login";
}
