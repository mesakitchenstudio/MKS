import { activityDocTopic } from "./topics/activity";
import { categoriesDocTopic } from "./topics/categories";
import { contentCalendarDocTopic } from "./topics/content-calendar";
import { contentHealthDocTopic } from "./topics/content-health";
import { contentPerformanceDocTopic } from "./topics/content-performance";
import { mediaAssetDocTopic } from "./topics/media-asset";
import { mediaDocTopic } from "./topics/media";
import { memberDetailDocTopic } from "./topics/member-detail";
import { membersDocTopic } from "./topics/members";
import { newsletterDocTopic } from "./topics/newsletter";
import { notificationsDocTopic } from "./topics/notifications";
import { profileDocTopic } from "./topics/profile";
import { recipeEditorDocTopic } from "./topics/recipe-editor";
import { recipeHistoryDocTopic } from "./topics/recipe-history";
import { recipePerformanceDocTopic } from "./topics/recipe-performance";
import { recipeTypeEditorDocTopic } from "./topics/recipe-type-editor";
import { recipeTypesDocTopic } from "./topics/recipe-types";
import { recipesDocTopic } from "./topics/recipes";
import { redirectsDocTopic } from "./topics/redirects";
import { reviewDetailDocTopic } from "./topics/review-detail";
import { reviewsDocTopic } from "./topics/reviews";
import { searchAnalyticsDocTopic } from "./topics/search-analytics";
import { searchConsoleDocTopic } from "./topics/search-console";
import { seriesDocTopic } from "./topics/series";
import { seriesEditorDocTopic } from "./topics/series-editor";
import { seriesImportDocTopic } from "./topics/series-import";
import { siteHealthDocTopic } from "./topics/site-health";
import { studioDocTopic } from "./topics/studio";
import { teamAccessDocTopic } from "./topics/team-access";
import { visitorDetailDocTopic } from "./topics/visitor-detail";
import { visitorsDocTopic } from "./topics/visitors";
import { youtubeDocTopic } from "./topics/youtube";
import { youtubeVideoDocTopic } from "./topics/youtube-video";
import {
  APPROVED_FUTURE_DOC_TOPIC_IDS,
  type AdminDocTopic,
} from "./types";
import { filterAdminDocTopicsForRole } from "./access";

export type {
  AdminDocCategory,
  AdminDocSection,
  AdminDocSectionId,
  AdminDocTopic,
} from "./types";
export { APPROVED_FUTURE_DOC_TOPIC_IDS } from "./types";
export { ADMIN_DOC_CATEGORY_LABELS, ADMIN_DOC_CATEGORY_ORDER } from "./categories";
export {
  ADMIN_DOC_TOPIC_ACCESS,
  ADMIN_DOC_TOPIC_PAGE_LINKS,
  adminDocumentationCenterHref,
  canAccessAdminDocTopic,
  filterAdminDocTopicsForRole,
  getAdminDocPageLink,
  getAdminDocTopicAccessArea,
  groupAdminDocTopicsByCategory,
  type AdminDocPageLink,
  type AdminDocTopicAccessArea,
} from "./access";
export { searchAdminDocTopics, type AdminDocSearchMatch } from "./search";

/** Canonical registry — Phase 1 + Phase 2 + Phase 3 deep topics. */
export const ADMIN_DOC_TOPICS: AdminDocTopic[] = [
  recipesDocTopic,
  recipeEditorDocTopic,
  recipeHistoryDocTopic,
  contentCalendarDocTopic,
  contentHealthDocTopic,
  siteHealthDocTopic,
  notificationsDocTopic,
  studioDocTopic,
  mediaDocTopic,
  mediaAssetDocTopic,
  categoriesDocTopic,
  seriesDocTopic,
  seriesEditorDocTopic,
  seriesImportDocTopic,
  recipeTypesDocTopic,
  recipeTypeEditorDocTopic,
  redirectsDocTopic,
  reviewsDocTopic,
  reviewDetailDocTopic,
  membersDocTopic,
  memberDetailDocTopic,
  newsletterDocTopic,
  contentPerformanceDocTopic,
  recipePerformanceDocTopic,
  visitorsDocTopic,
  visitorDetailDocTopic,
  searchAnalyticsDocTopic,
  searchConsoleDocTopic,
  youtubeDocTopic,
  youtubeVideoDocTopic,
  teamAccessDocTopic,
  activityDocTopic,
  profileDocTopic,
];

const topicsById = new Map(ADMIN_DOC_TOPICS.map((topic) => [topic.id, topic]));

/** Exact path → topic id for main Admin destinations (Phase 1 + 2). */
const EXACT_PATH_TOPIC_IDS: Record<string, string> = {
  "/admin": "recipes",
  "/admin/recipes/new": "recipe-editor",
  "/admin/content-calendar": "content-calendar",
  "/admin/content-health": "content-health",
  "/admin/site-health": "site-health",
  "/admin/notifications": "notifications",
  "/admin/studio": "studio",
  "/admin/media": "media",
  "/admin/categories": "categories",
  "/admin/series": "series",
  "/admin/series/new": "series-editor",
  "/admin/series/import": "series-import",
  "/admin/types": "recipe-types",
  "/admin/redirects": "redirects",
  "/admin/reviews": "reviews",
  "/admin/members": "members",
  "/admin/newsletter": "newsletter",
  "/admin/content-performance": "content-performance",
  "/admin/visitors": "visitors",
  "/admin/search": "search-analytics",
  "/admin/search-console": "search-console",
  "/admin/youtube": "youtube",
  "/admin/staff": "team-access",
  "/admin/activity": "activity",
  "/admin/profile": "profile",
};

export function listAdminDocTopics(): AdminDocTopic[] {
  return ADMIN_DOC_TOPICS;
}

export function listAdminDocTopicsForRole(role: string): AdminDocTopic[] {
  return filterAdminDocTopicsForRole(role, listAdminDocTopics());
}

export function getAdminDocTopicById(id: string): AdminDocTopic | null {
  return topicsById.get(id) ?? null;
}

function normalizeAdminPath(pathname: string): string {
  const raw = String(pathname || "").split("?")[0].split("#")[0].trim();
  if (!raw) return "";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  if (withLeading.length > 1 && withLeading.endsWith("/")) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
}

/**
 * Resolve documentation for an Admin pathname.
 * Preview stays null. Phase 3 deep routes resolve after exact matches.
 */
export function getAdminDocTopicForPath(pathname: string): AdminDocTopic | null {
  const path = normalizeAdminPath(pathname);
  if (!path.startsWith("/admin")) return null;

  if (
    path === "/admin/login" ||
    path === "/admin/forgot-password" ||
    path === "/admin/reset-password" ||
    path === "/admin/documentation"
  ) {
    return null;
  }

  // Preview must never resolve — check before any other recipe patterns.
  if (/^\/admin\/recipes\/[^/]+\/preview$/.test(path)) return null;

  const exactId = EXACT_PATH_TOPIC_IDS[path];
  if (exactId) return getAdminDocTopicById(exactId);

  // Recipe history (list + revision detail)
  if (/^\/admin\/recipes\/[^/]+\/history(?:\/[^/]+)?$/.test(path)) {
    return getAdminDocTopicById("recipe-history");
  }

  // Recipe editor only — exact `/admin/recipes/:id`, not history/preview/children
  if (/^\/admin\/recipes\/[^/]+$/.test(path)) return getAdminDocTopicById("recipe-editor");

  if (/^\/admin\/media\/[^/]+$/.test(path)) return getAdminDocTopicById("media-asset");
  if (/^\/admin\/series\/[^/]+$/.test(path)) return getAdminDocTopicById("series-editor");
  if (/^\/admin\/types\/[^/]+$/.test(path)) return getAdminDocTopicById("recipe-type-editor");
  if (/^\/admin\/reviews\/[^/]+$/.test(path)) return getAdminDocTopicById("review-detail");
  if (/^\/admin\/members\/[^/]+$/.test(path)) return getAdminDocTopicById("member-detail");
  if (/^\/admin\/content-performance\/recipes\/[^/]+$/.test(path)) {
    return getAdminDocTopicById("recipe-performance");
  }
  if (/^\/admin\/visitors\/[^/]+$/.test(path)) return getAdminDocTopicById("visitor-detail");
  if (/^\/admin\/youtube\/videos\/[^/]+$/.test(path)) return getAdminDocTopicById("youtube-video");

  return null;
}

export function isApprovedRelatedDocTopicId(id: string): boolean {
  if (topicsById.has(id)) return true;
  return (APPROVED_FUTURE_DOC_TOPIC_IDS as readonly string[]).includes(id);
}

/**
 * Pure overlay toggle used in tests to prove documentation open/close
 * does not mutate editor field state.
 */
export function toggleDocumentationOverlayWithoutTouchingForm<T extends object>(
  formState: T,
  documentationOpen: boolean,
  nextOpen: boolean,
): { formState: T; documentationOpen: boolean } {
  return {
    formState,
    documentationOpen: nextOpen,
  };
}

/** Main navigation paths covered by Phase 1 + Phase 2 documentation. */
export const ADMIN_DOC_MAIN_NAV_PATHS = Object.keys(EXACT_PATH_TOPIC_IDS).filter(
  (path) =>
    path !== "/admin/series/new" &&
    path !== "/admin/series/import",
);
