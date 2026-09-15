/**
 * Roadmap #8B — trusted Follow persistence helpers.
 *
 * These accept a trusted `userId` for composition/tests.
 * Phase 8C public server actions MUST derive userId from the auth session —
 * never accept client-supplied userId.
 */

import { getDb } from "@/lib/db";
import {
  isFollowableCategoryGroup,
  memberFollowErrorMessage,
  type MemberFollowActionResult,
  type MemberFollowError,
  type MemberFollowList,
  type MemberFollowListItem,
} from "@/lib/member-follows";

function fail(error: MemberFollowError, message?: string): MemberFollowActionResult<never> {
  return { ok: false, error, message: message || memberFollowErrorMessage(error) };
}

function ok(): MemberFollowActionResult {
  return { ok: true };
}

/** Follow a published Series by canonical id. Idempotent. */
export async function followSeriesForUser(
  userId: string,
  seriesId: string,
): Promise<MemberFollowActionResult> {
  const id = seriesId.trim();
  if (!userId.trim() || !id) return fail("INVALID_TARGET");

  const db = getDb();
  const series = await db.series.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  });
  if (!series) return fail("TARGET_NOT_FOUND");
  if (!series.isPublished) return fail("TARGET_NOT_FOLLOWABLE", "That collection is not published.");

  try {
    await db.userSeriesFollow.create({
      data: { userId, seriesId: series.id },
    });
  } catch (error) {
    // Unique violation → already following (idempotent success).
    if (isUniqueConstraintError(error)) return ok();
    throw error;
  }
  return ok();
}

/** Unfollow Series. Idempotent when already absent. */
export async function unfollowSeriesForUser(
  userId: string,
  seriesId: string,
): Promise<MemberFollowActionResult> {
  const id = seriesId.trim();
  if (!userId.trim() || !id) return fail("INVALID_TARGET");

  const db = getDb();
  await db.userSeriesFollow.deleteMany({
    where: { userId, seriesId: id },
  });
  return ok();
}

export async function isSeriesFollowedByUser(userId: string, seriesId: string): Promise<boolean> {
  const id = seriesId.trim();
  if (!userId.trim() || !id) return false;
  const db = getDb();
  const row = await db.userSeriesFollow.findUnique({
    where: { userId_seriesId: { userId, seriesId: id } },
    select: { id: true },
  });
  return Boolean(row);
}

/** Follow eligible Category (Topic). Rejects method/unknown groups. Idempotent. */
export async function followCategoryForUser(
  userId: string,
  categoryId: string,
): Promise<MemberFollowActionResult> {
  const id = categoryId.trim();
  if (!userId.trim() || !id) return fail("INVALID_TARGET");

  const db = getDb();
  const category = await db.category.findUnique({
    where: { id },
    select: { id: true, group: true },
  });
  if (!category) return fail("TARGET_NOT_FOUND");
  if (!isFollowableCategoryGroup(category.group)) {
    return fail("TARGET_NOT_FOLLOWABLE");
  }

  try {
    await db.userCategoryFollow.create({
      data: { userId, categoryId: category.id },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return ok();
    throw error;
  }
  return ok();
}

export async function unfollowCategoryForUser(
  userId: string,
  categoryId: string,
): Promise<MemberFollowActionResult> {
  const id = categoryId.trim();
  if (!userId.trim() || !id) return fail("INVALID_TARGET");

  const db = getDb();
  await db.userCategoryFollow.deleteMany({
    where: { userId, categoryId: id },
  });
  return ok();
}

export async function isCategoryFollowedByUser(
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const id = categoryId.trim();
  if (!userId.trim() || !id) return false;
  const db = getDb();
  const row = await db.userCategoryFollow.findUnique({
    where: { userId_categoryId: { userId, categoryId: id } },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Presentation-safe Following list.
 * Omits unpublished Series from the visible list (row may remain until unpublish/delete).
 * Categories remain listed regardless of thin SEO state.
 */
export async function listMemberFollowsForUser(userId: string): Promise<MemberFollowList> {
  if (!userId.trim()) return { series: [], categories: [] };
  const db = getDb();

  const [seriesRows, categoryRows] = await Promise.all([
    db.userSeriesFollow.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        series: { select: { id: true, title: true, slug: true, isPublished: true } },
      },
    }),
    db.userCategoryFollow.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        category: { select: { id: true, name: true, slug: true, group: true } },
      },
    }),
  ]);

  const series: Extract<MemberFollowListItem, { type: "series" }>[] = [];
  for (const row of seriesRows) {
    if (!row.series?.isPublished) continue;
    series.push({
      type: "series",
      id: row.series.id,
      name: row.series.title,
      slug: row.series.slug,
      followedAt: row.createdAt.toISOString(),
      isPublished: true,
    });
  }

  const categories: Extract<MemberFollowListItem, { type: "category" }>[] = [];
  for (const row of categoryRows) {
    if (!row.category) continue;
    // Drop ineligible groups if taxonomy changed after follow.
    if (!isFollowableCategoryGroup(row.category.group)) continue;
    categories.push({
      type: "category",
      id: row.category.id,
      name: row.category.name,
      slug: row.category.slug,
      group: row.category.group,
      followedAt: row.createdAt.toISOString(),
    });
  }

  return { series, categories };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}
