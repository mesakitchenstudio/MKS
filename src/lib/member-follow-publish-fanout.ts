/**
 * Roadmap #8D — post-commit follower notification fan-out on first-ever publish.
 */

import { isMemberFollowsEnabled } from "@/lib/flags";
import { getDb } from "@/lib/db";
import { isFollowableCategoryGroup } from "@/lib/member-follows";
import { createRecipeFollowedPublishNotificationForUser } from "@/lib/member-notifications-server";
import type { MemberNotificationPrimaryContext } from "@/lib/member-notifications";
import {
  isFirstEverRecipePublicationTransition,
  type FirstEverPublicationTransitionInput,
} from "@/lib/recipe-first-publication";

export type FanOutRecipeFollowedPublishResult = {
  enabled: boolean;
  eligible: boolean;
  matchingSeriesCount: number;
  matchingCategoryCount: number;
  matchedUsers: number;
  attempted: number;
  created: number;
  deduped: number;
  failed: number;
  durationMs: number;
};

function emptyResult(
  overrides: Partial<FanOutRecipeFollowedPublishResult> & { durationMs: number },
): FanOutRecipeFollowedPublishResult {
  return {
    enabled: false,
    eligible: false,
    matchingSeriesCount: 0,
    matchingCategoryCount: 0,
    matchedUsers: 0,
    attempted: 0,
    created: 0,
    deduped: 0,
    failed: 0,
    ...overrides,
  };
}

type RankedSeries = { id: string; title: string };
type RankedCategory = { id: string; name: string };

function sortSeries(a: RankedSeries, b: RankedSeries): number {
  const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  if (byTitle !== 0) return byTitle;
  return a.id.localeCompare(b.id);
}

function sortCategories(a: RankedCategory, b: RankedCategory): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/** Deterministic primary context: published Series beats eligible Category; tie-break name then id. */
export function pickPrimaryFollowPublishContext(input: {
  followedSeriesIds: Set<string>;
  followedCategoryIds: Set<string>;
  matchingSeries: RankedSeries[];
  matchingCategories: RankedCategory[];
}): MemberNotificationPrimaryContext {
  for (const series of input.matchingSeries) {
    if (input.followedSeriesIds.has(series.id)) {
      return { kind: "series", seriesId: series.id };
    }
  }
  for (const category of input.matchingCategories) {
    if (input.followedCategoryIds.has(category.id)) {
      return { kind: "category", categoryId: category.id };
    }
  }
  return { kind: "none" };
}

/**
 * Fan-out RECIPE_FOLLOWED_PUBLISH notifications for one newly published Recipe.
 * Caller must ensure first-ever publication eligibility and post-commit timing.
 */
export async function fanOutRecipeFollowedPublishNotifications(
  recipeId: string,
): Promise<FanOutRecipeFollowedPublishResult> {
  const start = Date.now();
  const id = recipeId.trim();

  if (!isMemberFollowsEnabled()) {
    return emptyResult({ enabled: false, eligible: true, durationMs: Date.now() - start });
  }
  if (!id) {
    return emptyResult({ enabled: true, eligible: true, failed: 1, durationMs: Date.now() - start });
  }

  const db = getDb();

  const recipe = await db.recipe.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!recipe || recipe.status !== "published") {
    return emptyResult({ enabled: true, eligible: true, durationMs: Date.now() - start });
  }

  const [seriesItems, recipeCategories] = await Promise.all([
    db.seriesItem.findMany({
      where: { recipeId: id },
      select: {
        series: { select: { id: true, title: true, isPublished: true } },
      },
    }),
    db.recipeCategory.findMany({
      where: { recipeId: id },
      select: {
        category: { select: { id: true, name: true, group: true } },
      },
    }),
  ]);

  const matchingSeries = seriesItems
    .map((row) => row.series)
    .filter((series): series is { id: string; title: string; isPublished: boolean } =>
      Boolean(series?.isPublished),
    )
    .map((series) => ({ id: series.id, title: series.title }))
    .sort(sortSeries);

  const matchingCategories = recipeCategories
    .map((row) => row.category)
    .filter(
      (category): category is { id: string; name: string; group: string } =>
        Boolean(category && isFollowableCategoryGroup(category.group)),
    )
    .map((category) => ({ id: category.id, name: category.name }))
    .sort(sortCategories);

  const seriesIds = matchingSeries.map((series) => series.id);
  const categoryIds = matchingCategories.map((category) => category.id);

  const [seriesFollows, categoryFollows] = await Promise.all([
    seriesIds.length
      ? db.userSeriesFollow.findMany({
          where: { seriesId: { in: seriesIds } },
          select: { userId: true, seriesId: true },
        })
      : Promise.resolve([]),
    categoryIds.length
      ? db.userCategoryFollow.findMany({
          where: { categoryId: { in: categoryIds } },
          select: { userId: true, categoryId: true },
        })
      : Promise.resolve([]),
  ]);

  const seriesFollowsByUser = new Map<string, Set<string>>();
  for (const row of seriesFollows) {
    const set = seriesFollowsByUser.get(row.userId) ?? new Set<string>();
    set.add(row.seriesId);
    seriesFollowsByUser.set(row.userId, set);
  }

  const categoryFollowsByUser = new Map<string, Set<string>>();
  for (const row of categoryFollows) {
    const set = categoryFollowsByUser.get(row.userId) ?? new Set<string>();
    set.add(row.categoryId);
    categoryFollowsByUser.set(row.userId, set);
  }

  const userIds = [...new Set([...seriesFollowsByUser.keys(), ...categoryFollowsByUser.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );

  let attempted = 0;
  let created = 0;
  let deduped = 0;
  let failed = 0;

  for (const userId of userIds) {
    attempted += 1;
    const context = pickPrimaryFollowPublishContext({
      followedSeriesIds: seriesFollowsByUser.get(userId) ?? new Set(),
      followedCategoryIds: categoryFollowsByUser.get(userId) ?? new Set(),
      matchingSeries,
      matchingCategories,
    });

    try {
      const result = await createRecipeFollowedPublishNotificationForUser({
        userId,
        recipeId: id,
        context,
      });
      if (!result.ok) {
        failed += 1;
        continue;
      }
      if (result.data.created) created += 1;
      else deduped += 1;
    } catch {
      failed += 1;
    }
  }

  const durationMs = Date.now() - start;
  const result: FanOutRecipeFollowedPublishResult = {
    enabled: true,
    eligible: true,
    matchingSeriesCount: matchingSeries.length,
    matchingCategoryCount: matchingCategories.length,
    matchedUsers: userIds.length,
    attempted,
    created,
    deduped,
    failed,
    durationMs,
  };

  console.info("recipe.followed_publish.fan_out", {
    recipeId: id,
    matchingSeriesCount: result.matchingSeriesCount,
    matchingCategoryCount: result.matchingCategoryCount,
    matchedUsers: result.matchedUsers,
    created: result.created,
    deduped: result.deduped,
    failed: result.failed,
    durationMs: result.durationMs,
  });

  return result;
}

/**
 * Post-commit integration entry: eligibility gate + fan-out with safe failure semantics.
 * `hadPriorPublication` must be computed before the current publish audit/revision row.
 */
export async function maybeRunRecipeFollowedPublishFanOut(
  input: FirstEverPublicationTransitionInput & { recipeId: string },
): Promise<FanOutRecipeFollowedPublishResult> {
  const start = Date.now();
  const eligible = isFirstEverRecipePublicationTransition({
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    hadPriorPublication: input.hadPriorPublication,
  });

  if (!eligible) {
    return emptyResult({
      enabled: isMemberFollowsEnabled(),
      eligible: false,
      durationMs: Date.now() - start,
    });
  }

  try {
    return await fanOutRecipeFollowedPublishNotifications(input.recipeId);
  } catch (error) {
    console.error("recipe.followed_publish.fan_out_failed", {
      recipeId: input.recipeId.trim(),
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : "unknown",
    });
    return emptyResult({
      enabled: isMemberFollowsEnabled(),
      eligible: true,
      failed: 1,
      durationMs: Date.now() - start,
    });
  }
}
