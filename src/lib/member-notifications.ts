/**
 * Roadmap #8 — Member in-app Notifications domain (pure helpers + types).
 * Persistence: member-notifications-server.ts (trusted userId composition).
 * Public routes/actions (Phase 8E) must derive userId from auth session.
 */

export const MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH = "RECIPE_FOLLOWED_PUBLISH" as const;

export type MemberNotificationType = typeof MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH;

/** Semantic dedupe key — one followed-publish alert per member per Recipe ever. */
export function buildRecipeFollowedPublishDedupeKey(recipeId: string): string {
  return `recipe.followed_publish:${recipeId.trim()}`;
}

export type MemberNotificationPrimaryContext =
  | { kind: "series"; seriesId: string }
  | { kind: "category"; categoryId: string }
  | { kind: "none" };

export function normalizeMemberNotificationContext(
  input: MemberNotificationPrimaryContext | null | undefined,
):
  | { ok: true; seriesId: string | null; categoryId: string | null }
  | { ok: false; error: "INVALID_CONTEXT" } {
  if (!input || input.kind === "none") {
    return { ok: true, seriesId: null, categoryId: null };
  }
  if (input.kind === "series") {
    const seriesId = input.seriesId.trim();
    if (!seriesId) return { ok: false, error: "INVALID_CONTEXT" };
    return { ok: true, seriesId, categoryId: null };
  }
  if (input.kind === "category") {
    const categoryId = input.categoryId.trim();
    if (!categoryId) return { ok: false, error: "INVALID_CONTEXT" };
    return { ok: true, seriesId: null, categoryId };
  }
  return { ok: false, error: "INVALID_CONTEXT" };
}

export const MEMBER_NOTIFICATION_LIST_DEFAULT_LIMIT = 50;
export const MEMBER_NOTIFICATION_LIST_MAX_LIMIT = 100;

export function clampMemberNotificationListLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return MEMBER_NOTIFICATION_LIST_DEFAULT_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, MEMBER_NOTIFICATION_LIST_MAX_LIMIT);
}

export const MEMBER_NOTIFICATION_ERRORS = [
  "FEATURE_DISABLED",
  "NOT_AUTHENTICATED",
  "NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_CONTEXT",
] as const;

export type MemberNotificationError = (typeof MEMBER_NOTIFICATION_ERRORS)[number];

export type MemberNotificationActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: MemberNotificationError; message: string };

export function memberNotificationErrorMessage(error: MemberNotificationError): string {
  switch (error) {
    case "FEATURE_DISABLED":
      return "Notifications are not available.";
    case "NOT_AUTHENTICATED":
      return "Sign in to view notifications.";
    case "NOT_FOUND":
      return "Notification not found.";
    case "INVALID_INPUT":
      return "Invalid notification request.";
    case "INVALID_CONTEXT":
      return "Invalid notification context.";
    default:
      return "Something went wrong.";
  }
}

/** Recipe visibility for presentation-safe notification cards. */
export type MemberNotificationRecipeAvailability = "available" | "unavailable" | "orphaned";

export type MemberNotificationListItem = {
  id: string;
  type: MemberNotificationType;
  createdAt: string;
  readAt: string | null;
  unread: boolean;
  recipeId: string | null;
  recipeAvailability: MemberNotificationRecipeAvailability;
  /** Public slug when available; otherwise null. */
  recipeSlug: string | null;
  /** Clean card title when available; never YouTube title. */
  recipeTitle: string | null;
  context:
    | { kind: "series"; id: string; name: string; slug: string }
    | { kind: "category"; id: string; name: string; slug: string }
    | { kind: "none" };
};
