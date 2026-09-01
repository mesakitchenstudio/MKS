import { canAccess, type AccessLevel } from "@/lib/admin-access";
import {
  adminWorkspaceNarrow,
  adminWorkspaceStandard,
  adminWorkspaceWide,
} from "@/lib/admin-ui";

export type AdminNavMatch = "exact" | "prefix" | "recipes-index";

export type AdminNavItem = {
  href: string;
  label: string;
  match?: AdminNavMatch;
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

/** Role-aware navigation sections — mirrors existing `canAccess` rules. */
export function buildAdminNavSections(role: AccessLevel): AdminNavSection[] {
  const sections: AdminNavSection[] = [];

  if (canAccess(role, "content")) {
    sections.push({
      id: "content",
      label: "Content",
      items: [
        { href: "/admin", label: "Recipes", match: "recipes-index" },
        { href: "/admin/types", label: "Recipe types" },
        { href: "/admin/categories", label: "Categories" },
        { href: "/admin/series", label: "Series" },
      ],
    });
    sections.push({
      id: "community",
      label: "Community",
      items: [{ href: "/admin/reviews", label: "Reviews" }],
    });
  }

  if (canAccess(role, "members") || canAccess(role, "youtube")) {
    const audienceItems: AdminNavItem[] = [];
    if (canAccess(role, "members")) {
      audienceItems.push(
        { href: "/admin/members", label: "Members" },
        { href: "/admin/visitors", label: "Visitors" },
      );
    }
    if (canAccess(role, "youtube")) {
      audienceItems.push({ href: "/admin/youtube", label: "YouTube" });
    }
    sections.push({
      id: "audience",
      label: "Audience",
      items: audienceItems,
    });
  }

  if (canAccess(role, "staff")) {
    sections.push({
      id: "administration",
      label: "Administration",
      items: [{ href: "/admin/staff", label: "Team access" }],
    });
  }

  return sections;
}

/** Flat item labels for tests and diagnostics — navigation is route/query independent. */
export function flattenAdminNavItemLabels(sections: AdminNavSection[]): string[] {
  return sections.flatMap((section) => section.items.map((item) => item.label));
}

export function adminWorkspaceWidthForPath(pathname: string) {
  if (pathname.startsWith("/admin/profile")) return adminWorkspaceNarrow;
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/recipes") ||
    pathname.startsWith("/admin/series") ||
    pathname.startsWith("/admin/members") ||
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
