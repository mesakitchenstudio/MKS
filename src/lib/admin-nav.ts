import { canAccess, type AccessLevel, type AdminArea } from "@/lib/admin-access";
import {
  adminWorkspaceCategories,
  adminWorkspaceMembersDetail,
  adminWorkspaceMembersList,
  adminWorkspaceNewsletter,
  adminWorkspaceProfile,
  adminWorkspaceRecipes,
  adminWorkspaceReviewsDetail,
  adminWorkspaceReviewsList,
  adminWorkspaceSeries,
  adminWorkspaceStandard,
  adminWorkspaceTypes,
  adminWorkspaceWide,
} from "@/lib/admin-ui";

export type AdminNavMatch = "exact" | "prefix" | "recipes-index";

export type AdminNavItem = {
  href: string;
  label: string;
  match?: AdminNavMatch;
  /** Existing permission area — unchanged from prior IA. */
  area: AdminArea;
  /** Optional product feature gate (server-derived; never NEXT_PUBLIC). */
  feature?: "recipeQa";
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
      { href: "/admin/content-calendar", label: "Content Calendar", match: "prefix", area: "content" },
      { href: "/admin/content-health", label: "Content Health", match: "prefix", area: "content" },
      { href: "/admin/site-health", label: "Site Health", match: "prefix", area: "content" },
      { href: "/admin/notifications", label: "Notifications", match: "prefix", area: "content" },
      { href: "/admin/studio", label: "Studio", match: "prefix", area: "content" },
    ],
  },
  {
    id: "library",
    label: "Library",
    items: [
      { href: "/admin/media", label: "Media", match: "prefix", area: "content" },
      { href: "/admin/categories", label: "Categories", area: "content" },
      { href: "/admin/ingredients", label: "Ingredients", area: "content" },
      { href: "/admin/series", label: "Collections", area: "content" },
      { href: "/admin/types", label: "Recipe types", area: "content" },
      { href: "/admin/redirects", label: "Redirects", area: "content" },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      { href: "/admin/reviews", label: "Reviews", area: "content" },
      { href: "/admin/questions", label: "Questions", area: "content", feature: "recipeQa" },
      { href: "/admin/members", label: "Members", area: "members" },
      { href: "/admin/newsletter", label: "Newsletter", area: "members" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    items: [
      { href: "/admin/content-performance", label: "Content Performance", match: "prefix", area: "content" },
      { href: "/admin/visitors", label: "Visitors", area: "members" },
      { href: "/admin/search", label: "Search", match: "exact", area: "content" },
      { href: "/admin/search-console", label: "Search Console", match: "prefix", area: "content" },
      { href: "/admin/youtube", label: "YouTube", area: "youtube" },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      { href: "/admin/staff", label: "Team access", area: "staff" },
      { href: "/admin/activity", label: "Activity", match: "exact", area: "staff" },
    ],
  },
];

/** Role-aware navigation sections — same global IA; filters via existing `canAccess` rules. */
export function buildAdminNavSections(
  role: AccessLevel,
  options?: { recipeQaEnabled?: boolean },
): AdminNavSection[] {
  const recipeQaEnabled = options?.recipeQaEnabled === true;
  return ADMIN_NAV_IA.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!canAccess(role, item.area)) return false;
      if (item.feature === "recipeQa" && !recipeQaEnabled) return false;
      return true;
    }),
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
  if (pathname.startsWith("/admin/newsletter")) return adminWorkspaceNewsletter;
  if (pathname.startsWith("/admin/reviews/")) return adminWorkspaceReviewsDetail;
  if (pathname.startsWith("/admin/reviews")) return adminWorkspaceReviewsList;
  if (pathname.startsWith("/admin/questions/")) return adminWorkspaceReviewsDetail;
  if (pathname.startsWith("/admin/questions")) return adminWorkspaceReviewsList;
  if (pathname.startsWith("/admin/types")) return adminWorkspaceTypes;
  if (pathname.startsWith("/admin/categories")) return adminWorkspaceCategories;
  if (pathname.startsWith("/admin/ingredients")) return adminWorkspaceCategories;
  if (pathname.startsWith("/admin/redirects")) return adminWorkspaceCategories;
  if (pathname.startsWith("/admin/media")) return adminWorkspaceWide;
  if (pathname.startsWith("/admin/activity")) return adminWorkspaceWide;
  if (pathname.startsWith("/admin/series")) return adminWorkspaceSeries;
  if (pathname === "/admin") return adminWorkspaceRecipes;
  if (
    pathname.startsWith("/admin/recipes") ||
    pathname.startsWith("/admin/content-calendar") ||
    pathname.startsWith("/admin/content-health") ||
    pathname.startsWith("/admin/site-health") ||
    pathname.startsWith("/admin/notifications") ||
    pathname.startsWith("/admin/visitors") ||
    pathname.startsWith("/admin/content-performance") ||
    pathname.startsWith("/admin/search") ||
    pathname.startsWith("/admin/search-console") ||
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
  if (/\/admin\/recipes\/[^/]+\/preview\/?$/.test(pathname)) return "Recipe preview";
  if (/\/admin\/recipes\/[^/]+\/history/.test(pathname)) return "History";
  if (pathname.startsWith("/admin/recipes/")) return "Edit recipe";
  return "Admin";
}
