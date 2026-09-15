/**
 * Roadmap #8B — trusted MemberNotification persistence helpers.
 *
 * Accept trusted `userId` for composition/tests.
 * Phase 8E public actions MUST derive userId from auth session — never client.
 * Do NOT call create from publish workflow yet (Phase 8D).
 */

import { getDb } from "@/lib/db";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import {
  MEMBER_NOTIFICATION_LIST_MAX_LIMIT,
  MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
  buildRecipeFollowedPublishDedupeKey,
  clampMemberNotificationListLimit,
  memberNotificationErrorMessage,
  normalizeMemberNotificationContext,
  type MemberNotificationActionResult,
  type MemberNotificationError,
  type MemberNotificationListItem,
  type MemberNotificationPrimaryContext,
  type MemberNotificationRecipeAvailability,
  type MemberNotificationType,
} from "@/lib/member-notifications";

function fail(
  error: MemberNotificationError,
  message?: string,
): MemberNotificationActionResult<never> {
  return { ok: false, error, message: message || memberNotificationErrorMessage(error) };
}

function ok(): MemberNotificationActionResult {
  return { ok: true };
}

function okData<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function parseValues(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

export type CreateFollowedPublishNotificationInput = {
  userId: string;
  recipeId: string;
  context?: MemberNotificationPrimaryContext | null;
};

/**
 * Idempotent create for RECIPE_FOLLOWED_PUBLISH.
 * Builds dedupeKey internally — callers cannot override.
 */
export async function createRecipeFollowedPublishNotificationForUser(
  input: CreateFollowedPublishNotificationInput,
): Promise<MemberNotificationActionResult<{ id: string; created: boolean }>> {
  const userId = input.userId.trim();
  const recipeId = input.recipeId.trim();
  if (!userId || !recipeId) return fail("INVALID_INPUT");

  const context = normalizeMemberNotificationContext(input.context ?? { kind: "none" });
  if (!context.ok) return fail("INVALID_CONTEXT");

  const db = getDb();
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { id: true },
  });
  if (!recipe) return fail("INVALID_INPUT", "Recipe not found.");

  if (context.seriesId) {
    const series = await db.series.findUnique({
      where: { id: context.seriesId },
      select: { id: true },
    });
    if (!series) return fail("INVALID_CONTEXT");
  }
  if (context.categoryId) {
    const category = await db.category.findUnique({
      where: { id: context.categoryId },
      select: { id: true },
    });
    if (!category) return fail("INVALID_CONTEXT");
  }

  const dedupeKey = buildRecipeFollowedPublishDedupeKey(recipe.id);

  try {
    const row = await db.memberNotification.create({
      data: {
        userId,
        type: MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
        recipeId: recipe.id,
        dedupeKey,
        seriesId: context.seriesId,
        categoryId: context.categoryId,
      },
      select: { id: true },
    });
    return okData({ id: row.id, created: true });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await db.memberNotification.findUnique({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        select: { id: true },
      });
      if (existing) return okData({ id: existing.id, created: false });
    }
    throw error;
  }
}

function recipeAvailability(
  recipe: { id: string; status: string } | null,
  recipeId: string | null,
): MemberNotificationRecipeAvailability {
  if (!recipeId || !recipe) return "orphaned";
  if (recipe.status === "published") return "available";
  return "unavailable";
}

function toListItem(row: {
  id: string;
  type: string;
  createdAt: Date;
  readAt: Date | null;
  recipeId: string | null;
  recipe: { id: string; slug: string; title: string; status: string; values: string } | null;
  series: { id: string; title: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
}): MemberNotificationListItem | null {
  if (row.type !== MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH) return null;

  const availability = recipeAvailability(row.recipe, row.recipeId);
  // Hide Draft/unpublished and deleted/orphaned from presentation list.
  if (availability !== "available" || !row.recipe) return null;

  const dishName = readEditorialDishName(parseValues(row.recipe.values));
  const recipeTitle = resolveRecipeCardTitle({
    title: row.recipe.title,
    dishName,
  });

  let context: MemberNotificationListItem["context"] = { kind: "none" };
  if (row.series) {
    context = {
      kind: "series",
      id: row.series.id,
      name: row.series.title,
      slug: row.series.slug,
    };
  } else if (row.category) {
    context = {
      kind: "category",
      id: row.category.id,
      name: row.category.name,
      slug: row.category.slug,
    };
  }

  return {
    id: row.id,
    type: row.type as MemberNotificationType,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    unread: row.readAt == null,
    recipeId: row.recipe.id,
    recipeAvailability: availability,
    recipeSlug: row.recipe.slug,
    recipeTitle,
    context,
  };
}

export async function listMemberNotificationsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<MemberNotificationListItem[]> {
  if (!userId.trim()) return [];
  const limit = clampMemberNotificationListLimit(options?.limit);
  const db = getDb();

  // Over-fetch slightly so hidden Draft/orphan rows can be skipped while still filling limit.
  const rows = await db.memberNotification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(limit * 3, MEMBER_NOTIFICATION_LIST_MAX_LIMIT * 2),
    include: {
      recipe: { select: { id: true, slug: true, title: true, status: true, values: true } },
      series: { select: { id: true, title: true, slug: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  const out: MemberNotificationListItem[] = [];
  for (const row of rows) {
    const item = toListItem(row);
    if (!item) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Unread count among rows that would be visible (Published recipe still present). */
export async function countUnreadMemberNotificationsForUser(userId: string): Promise<number> {
  if (!userId.trim()) return 0;
  const db = getDb();
  return db.memberNotification.count({
    where: {
      userId,
      readAt: null,
      recipeId: { not: null },
      recipe: { status: "published" },
    },
  });
}

export async function markMemberNotificationReadForUser(
  userId: string,
  notificationId: string,
): Promise<MemberNotificationActionResult> {
  const uid = userId.trim();
  const nid = notificationId.trim();
  if (!uid || !nid) return fail("INVALID_INPUT");

  const db = getDb();
  const existing = await db.memberNotification.findFirst({
    where: { id: nid, userId: uid },
    select: { id: true, readAt: true },
  });
  if (!existing) return fail("NOT_FOUND");

  if (existing.readAt) return ok();

  const updated = await db.memberNotification.updateMany({
    where: { id: nid, userId: uid, readAt: null },
    data: { readAt: new Date() },
  });
  // Race-safe: if another request marked it, still success.
  if (updated.count === 0) {
    const again = await db.memberNotification.findFirst({
      where: { id: nid, userId: uid },
      select: { id: true },
    });
    if (!again) return fail("NOT_FOUND");
  }
  return ok();
}

export async function markAllMemberNotificationsReadForUser(
  userId: string,
): Promise<MemberNotificationActionResult<{ updated: number }>> {
  const uid = userId.trim();
  if (!uid) return fail("INVALID_INPUT");

  const db = getDb();
  const result = await db.memberNotification.updateMany({
    where: { userId: uid, readAt: null },
    data: { readAt: new Date() },
  });
  return okData({ updated: result.count });
}
