import { canAccess, type AccessLevel, type AdminArea } from "@/lib/admin-access";
import {
  adminWorkspaceMembersDetail,
  adminWorkspaceMembersList,
  adminWorkspaceProfile,
  adminWorkspaceStandard,
  adminWorkspaceWide,
} from "@/lib/admin-ui";

export type AdminNavMatch = "exact" | "prefix" | "recipes-index";

export type AdminNavItem = {
  href: string;
  label: string;
  match?: AdminNavMatch;
  /** Existing permission area — unchanged from prior IA. */
  area: AdminArea;
};

export type AdminNavSection = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export function linkIsActive(pathname: string, href: string, match: AdminNavMatch = "prefix") {
  if (match === "recipes-index") {
    return pathname === "/admin" || pathname.startsWith("/admin/recipes");
  }
  if (match === "exact") return pathname === href;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * Canonical admin IA (global order). Role filtering removes unauthorized items,
 * then drops empty sections — never reorders remaining items.
 */
const ADMIN_NAV_IA: AdminNavSection[] = [
  {
    id: "publishing",
    label: "Publishing",
    items: [
      { href: "/admin", label: "Recipes", match: "recipes-index", area: "content" },
      { href: "/admin/studio", label: "Studio", match: "prefix", area: "content" },
    ],
  },
  {
    id: "library",
    label: "Library",
    items: [
      { href: "/admin/categories", label: "Categories", area: "content" },
      { href: "/admin/series", label: "Series", area: "content" },
      { href: "/admin/types", label: "Recipe types", area: "content" },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      { href: "/admin/reviews", label: "Reviews", area: "content" },
      { href: "/admin/members", label: "Members", area: "members" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    items: [
      { href: "/admin/visitors", label: "Visitors", area: "members" },
      { href: "/admin/youtube", label: "YouTube", area: "youtube" },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [{ href: "/admin/staff", label: "Team access", area: "staff" }],
  },
];

/** Role-aware navigation sections — same global IA; filters via existing `canAccess` rules. */
export function buildAdminNavSections(role: AccessLevel): AdminNavSection[] {
  return ADMIN_NAV_IA.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccess(role, item.area)),
  })).filter((section) => section.items.length > 0);
}

/** Flat item labels for tests and diagnostics — navigation is route/query independent. */
export function flattenAdminNavItemLabels(sections: AdminNavSection[]): string[] {
  return sections.flatMap((section) => section.items.map((item) => item.label));
}

export function adminWorkspaceWidthForPath(pathname: string) {
  if (pathname.startsWith("/admin/profile")) return adminWorkspaceProfile;
  if (pathname.startsWith("/admin/members/")) return adminWorkspaceMembersDetail;
  if (pathname === "/admin/members") return adminWorkspaceMembersList;
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/recipes") ||
    pathname.startsWith("/admin/series") ||
    pathname.startsWith("/admin/visitors") ||
    pathname.startsWith("/admin/youtube")
  ) {
    return adminWorkspaceWide;
  }
  return adminWorkspaceStandard;
}

export function adminPageTitleForPath(pathname: string, sections: AdminNavSection[]) {
  for (const section of sections) {
    for (const item of section.items) {
      if (linkIsActive(pathname, item.href, item.match ?? "prefix")) {
        return item.label;
      }
    }
  }
  if (pathname.startsWith("/admin/profile")) return "Profile";
  if (pathname.startsWith("/admin/recipes/new")) return "New recipe";
  if (pathname.startsWith("/admin/recipes/")) return "Edit recipe";
  return "Admin";
}
