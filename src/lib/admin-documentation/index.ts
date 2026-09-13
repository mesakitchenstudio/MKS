import { categoriesDocTopic } from "./topics/categories";
import { recipeEditorDocTopic } from "./topics/recipe-editor";
import { recipesDocTopic } from "./topics/recipes";
import { searchConsoleDocTopic } from "./topics/search-console";
import {
  APPROVED_FUTURE_DOC_TOPIC_IDS,
  type AdminDocTopic,
} from "./types";

export type {
  AdminDocCategory,
  AdminDocSection,
  AdminDocSectionId,
  AdminDocTopic,
} from "./types";
export { APPROVED_FUTURE_DOC_TOPIC_IDS } from "./types";
export { ADMIN_DOC_CATEGORY_LABELS, ADMIN_DOC_CATEGORY_ORDER } from "./categories";

/** Phase 1 registry — order is stable for future documentation center lists. */
export const ADMIN_DOC_TOPICS: AdminDocTopic[] = [
  recipesDocTopic,
  recipeEditorDocTopic,
  searchConsoleDocTopic,
  categoriesDocTopic,
];

const topicsById = new Map(ADMIN_DOC_TOPICS.map((topic) => [topic.id, topic]));

export function listAdminDocTopics(): AdminDocTopic[] {
  return ADMIN_DOC_TOPICS;
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
 * Resolve Phase 1 documentation for an Admin pathname.
 * Uses explicit matches — does not treat deep recipe subroutes as the editor.
 */
export function getAdminDocTopicForPath(pathname: string): AdminDocTopic | null {
  const path = normalizeAdminPath(pathname);
  if (!path.startsWith("/admin")) return null;

  // Auth / preview exclusions
  if (
    path === "/admin/login" ||
    path === "/admin/forgot-password" ||
    path === "/admin/reset-password"
  ) {
    return null;
  }
  if (/^\/admin\/recipes\/[^/]+\/preview$/.test(path)) return null;
  if (/^\/admin\/recipes\/[^/]+\/history(?:\/[^/]+)?$/.test(path)) return null;

  if (path === "/admin") return getAdminDocTopicById("recipes");
  if (path === "/admin/recipes/new") return getAdminDocTopicById("recipe-editor");
  // Exact recipe edit path only — not history/preview/cook-style children
  if (/^\/admin\/recipes\/[^/]+$/.test(path)) return getAdminDocTopicById("recipe-editor");
  if (path === "/admin/search-console") return getAdminDocTopicById("search-console");
  if (path === "/admin/categories") return getAdminDocTopicById("categories");

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
