/**
 * Roadmap #8B / #9E — trusted MemberNotification persistence helpers.
 *
 * Accept trusted `userId` for composition/tests.
 * Public actions MUST derive userId from auth session — never client.
 * Publish fan-out (Phase 8D) calls create via member-follow-publish-fanout.ts.
 * Recipe Q&A answer notifications (Phase 9E) via createRecipeQuestionAnsweredNotification.
 */

import { getDb } from "@/lib/db";
import { isRecipeQaEnabled } from "@/lib/flags";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { buildRecipeQuestionAnsweredDedupeKey } from "@/lib/recipe-questions";
import {
  MEMBER_NOTIFICATION_LIST_MAX_LIMIT,
  MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
  MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
  buildRecipeFollowedPublishDedupeKey,
  clampMemberNotificationListLimit,
  formatRecipeQuestionAnsweredNotificationTitle,
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

export type CreateRecipeQuestionAnsweredNotificationOutcome =
  | "created"
  | "deduped"
  | "skipped_gate"
  | "skipped_no_owner"
  | "skipped_invalid"
  | "failed";

export type CreateRecipeQuestionAnsweredNotificationResult = {
  outcome: CreateRecipeQuestionAnsweredNotificationOutcome;
  id?: string;
};

/**
 * Idempotent create for RECIPE_QUESTION_ANSWERED (first public answer).
 * Call only after editorial publish succeeds. Never rolls back publish.
 */
export async function createRecipeQuestionAnsweredNotification(input: {
  userId: string | null | undefined;
  questionId: string;
  recipeId: string;
}): Promise<CreateRecipeQuestionAnsweredNotificationResult> {
  if (!isRecipeQaEnabled()) {
    return { outcome: "skipped_gate" };
  }

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId) return { outcome: "skipped_no_owner" };

  const questionId = String(input.questionId || "").trim();
  const recipeId = String(input.recipeId || "").trim();
  if (!questionId || !recipeId) return { outcome: "skipped_invalid" };

  const dedupeKey = buildRecipeQuestionAnsweredDedupeKey(questionId);

  try {
    const db = getDb();
    const [user, question, recipe] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { id: true } }),
      db.recipeQuestion.findUnique({
        where: { id: questionId },
        select: { id: true, recipeId: true },
      }),
      db.recipe.findUnique({ where: { id: recipeId }, select: { id: true } }),
    ]);
    if (!user) return { outcome: "skipped_no_owner" };
    if (!recipe) return { outcome: "skipped_invalid" };
    if (!question || question.recipeId !== recipe.id) {
      return { outcome: "skipped_invalid" };
    }

    try {
      const row = await db.memberNotification.create({
        data: {
          userId: user.id,
          type: MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
          recipeId: recipe.id,
          recipeQuestionId: question.id,
          seriesId: null,
          categoryId: null,
          dedupeKey,
        },
        select: { id: true },
      });
      return { outcome: "created", id: row.id };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await db.memberNotification.findUnique({
          where: { userId_dedupeKey: { userId: user.id, dedupeKey } },
          select: { id: true },
        });
        if (existing) return { outcome: "deduped", id: existing.id };
      }
      throw error;
    }
  } catch (error) {
    console.error("Recipe Q&A answer notification create failed", {
      questionId,
      recipeId,
      kind: "failed",
    });
    void error;
    return { outcome: "failed" };
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

type NotificationRowForList = {
  id: string;
  type: string;
  createdAt: Date;
  readAt: Date | null;
  recipeId: string | null;
  recipeQuestionId: string | null;
  recipe: { id: string; slug: string; title: string; status: string; values: string } | null;
  recipeQuestion: {
    id: string;
    status: string;
    answerBody: string | null;
  } | null;
  series: { id: string; title: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
};

function toListItem(
  row: NotificationRowForList,
  options: { recipeQaEnabled: boolean },
): MemberNotificationListItem | null {
  if (row.type === MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH) {
    const availability = recipeAvailability(row.recipe, row.recipeId);
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
      recipeQuestionId: null,
    };
  }

  if (row.type === MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED) {
    if (!options.recipeQaEnabled) return null;
    const availability = recipeAvailability(row.recipe, row.recipeId);
    if (availability !== "available" || !row.recipe) return null;
    if (!row.recipeQuestionId || !row.recipeQuestion) return null;
    if (row.recipeQuestion.status !== "published") return null;
    if (!row.recipeQuestion.answerBody?.trim()) return null;

    const dishName = readEditorialDishName(parseValues(row.recipe.values));
    const recipeTitle = resolveRecipeCardTitle({
      title: row.recipe.title,
      dishName,
    });

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
      context: { kind: "none" },
      recipeQuestionId: row.recipeQuestion.id,
    };
  }

  // Unknown / unrenderable types — omit safely (do not crash Notification Center).
  return null;
}

const notificationListInclude = {
  recipe: { select: { id: true, slug: true, title: true, status: true, values: true } },
  recipeQuestion: { select: { id: true, status: true, answerBody: true } },
  series: { select: { id: true, title: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
} as const;

export async function listMemberNotificationsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<MemberNotificationListItem[]> {
  if (!userId.trim()) return [];
  const limit = clampMemberNotificationListLimit(options?.limit);
  const db = getDb();
  const recipeQaEnabled = isRecipeQaEnabled();

  // Over-fetch so hidden Draft/orphan/dormant Q&A rows can be skipped while filling limit.
  const rows = await db.memberNotification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(limit * 3, MEMBER_NOTIFICATION_LIST_MAX_LIMIT * 2),
    include: notificationListInclude,
  });

  const out: MemberNotificationListItem[] = [];
  for (const row of rows) {
    const item = toListItem(row, { recipeQaEnabled });
    if (!item) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Unread count among rows that would be visible in Notification Center.
 * Must stay in lockstep with list visibility (including Q&A gate + question state).
 */
export async function countUnreadMemberNotificationsForUser(userId: string): Promise<number> {
  if (!userId.trim()) return 0;
  const db = getDb();
  const recipeQaEnabled = isRecipeQaEnabled();

  const rows = await db.memberNotification.findMany({
    where: {
      userId,
      readAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MEMBER_NOTIFICATION_LIST_MAX_LIMIT * 2,
    include: notificationListInclude,
  });

  let count = 0;
  for (const row of rows) {
    const item = toListItem(row, { recipeQaEnabled });
    if (item) count += 1;
  }
  return count;
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

/**
 * Marks all unread rows for the member (including currently hidden/dormant).
 * Matches #8 semantics — does not filter by presentation visibility.
 * Visible unread Q&A rows become read; AccountMenu count updates on next fetch.
 */
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

/** Exported for tests — presentation title helper re-export path. */
export function buildRecipeQuestionAnsweredNotificationCopy(recipeTitle: string | null) {
  return formatRecipeQuestionAnsweredNotificationTitle(recipeTitle);
}
