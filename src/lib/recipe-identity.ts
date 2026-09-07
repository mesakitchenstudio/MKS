import { getDb } from "@/lib/db";
import { normalizeRedirectPath, recipePublicPath } from "@/lib/redirects";

export const RECIPE_IDENTITY_BACKFILL_SETTING_KEY = "recipe.identity.backfill.v1";

export type RecipeIdentityRef = {
  id: string;
  slug: string;
  title: string;
  status: string;
};

export type RecipeIdentityBackfillStatus =
  | "SUCCESS"
  | "SUCCESS_WITH_ORPHANS"
  | "SUCCESS_WITH_CONFLICTS"
  | "SUCCESS_WITH_ORPHANS_AND_CONFLICTS"
  | "ALREADY_DONE"
  | "FAILED";

export type RecipeIdentityReviewConflict = {
  recipeId: string;
  authorEmail: string;
  reviewIds: string[];
  reason: string;
};

export type RecipeIdentityBackfillReport = {
  status: RecipeIdentityBackfillStatus;
  savesExamined: number;
  savesResolved: number;
  savesMerged: number;
  savesOrphaned: number;
  reviewsExamined: number;
  reviewsResolved: number;
  reviewsMerged: number;
  reviewsOrphaned: number;
  reviewConflicts: number;
  reviewConflictDetails: RecipeIdentityReviewConflict[];
  funnelExamined: number;
  funnelResolved: number;
  funnelUnresolved: number;
  alreadyDone: boolean;
  errorMessage?: string;
};

type RecipeRow = { id: string; slug: string; title: string };

/** Resolve a recipe by public slug (any status — favorites may reference drafts rarely). */
export async function resolveRecipeBySlug(
  slug: string,
): Promise<RecipeIdentityRef | null> {
  const trimmed = String(slug || "").trim();
  if (!trimmed) return null;
  const row = await getDb().recipe.findUnique({
    where: { slug: trimmed },
    select: { id: true, slug: true, title: true, status: true },
  });
  return row;
}

/** Prefer published recipes for public review submission. */
export async function resolvePublishedRecipeBySlug(
  slug: string,
): Promise<RecipeIdentityRef | null> {
  const recipe = await resolveRecipeBySlug(slug);
  if (!recipe || recipe.status !== "published") return null;
  return recipe;
}

/**
 * After a published (or any) recipe slug change, refresh denormalized slug/title
 * on saves and reviews keyed by recipeId so Admin/legacy fields stay current.
 */
export async function syncDenormalizedRecipeIdentity(input: {
  recipeId: string;
  slug: string;
  title: string;
}) {
  const db = getDb();
  await Promise.all([
    db.recipeSave.updateMany({
      where: { recipeId: input.recipeId },
      data: { slug: input.slug, title: input.title },
    }),
    db.recipeReview.updateMany({
      where: { recipeId: input.recipeId },
      data: { recipeSlug: input.slug },
    }),
  ]);
}

/**
 * Map a legacy slug to a recipe using current Recipe.slug, else active redirects
 * from `/recipes/{slug}` (covers pre-identity rename + re-save duplicates).
 */
export function resolveRecipeFromLegacySlug(
  slug: string,
  bySlug: Map<string, RecipeRow>,
  redirectToByFrom: Map<string, string>,
): RecipeRow | null {
  const trimmed = String(slug || "").trim();
  if (!trimmed) return null;
  const direct = bySlug.get(trimmed);
  if (direct) return direct;

  const fromPath = normalizeRedirectPath(recipePublicPath(trimmed));
  if (!fromPath) return null;

  const seen = new Set<string>();
  let current = fromPath;
  for (let hop = 0; hop < 5; hop += 1) {
    if (seen.has(current)) return null;
    seen.add(current);
    const nextPath = redirectToByFrom.get(current);
    if (!nextPath) return null;
    const nextNorm = normalizeRedirectPath(nextPath);
    if (!nextNorm) return null;
    if (nextNorm.startsWith("/recipes/")) {
      const nextSlug = nextNorm.slice("/recipes/".length);
      if (nextSlug && !nextSlug.includes("/")) {
        const recipe = bySlug.get(nextSlug);
        if (recipe) return recipe;
      }
    }
    current = nextNorm;
  }
  return null;
}

function emptyReport(partial?: Partial<RecipeIdentityBackfillReport>): RecipeIdentityBackfillReport {
  return {
    status: "SUCCESS",
    savesExamined: 0,
    savesResolved: 0,
    savesMerged: 0,
    savesOrphaned: 0,
    reviewsExamined: 0,
    reviewsResolved: 0,
    reviewsMerged: 0,
    reviewsOrphaned: 0,
    reviewConflicts: 0,
    reviewConflictDetails: [],
    funnelExamined: 0,
    funnelResolved: 0,
    funnelUnresolved: 0,
    alreadyDone: false,
    ...partial,
  };
}

function finalizeStatus(report: RecipeIdentityBackfillReport): RecipeIdentityBackfillStatus {
  if (report.errorMessage) return "FAILED";
  if (report.alreadyDone) return "ALREADY_DONE";
  const orphans = report.savesOrphaned > 0 || report.reviewsOrphaned > 0;
  const conflicts = report.reviewConflicts > 0;
  if (orphans && conflicts) return "SUCCESS_WITH_ORPHANS_AND_CONFLICTS";
  if (orphans) return "SUCCESS_WITH_ORPHANS";
  if (conflicts) return "SUCCESS_WITH_CONFLICTS";
  return "SUCCESS";
}

export function formatRecipeIdentityBackfillReport(report: RecipeIdentityBackfillReport): string {
  const lines = [
    "Recipe Identity Backfill",
    "",
    "Recipe saves",
    `Examined:            ${report.savesExamined}`,
    `Resolved:            ${report.savesResolved}`,
    `Duplicates merged:   ${report.savesMerged}`,
    `Orphans:             ${report.savesOrphaned}`,
    "",
    "Reviews",
    `Examined:            ${report.reviewsExamined}`,
    `Resolved:            ${report.reviewsResolved}`,
    `Duplicates merged:   ${report.reviewsMerged}`,
    `Conflicts:           ${report.reviewConflicts}`,
    `Orphans:             ${report.reviewsOrphaned}`,
    "",
    "Funnel events",
    `Examined:            ${report.funnelExamined}`,
    `Resolved:            ${report.funnelResolved}`,
    `Unresolved:          ${report.funnelUnresolved}`,
    "",
    `Status:`,
    report.status,
  ];
  if (report.errorMessage) {
    lines.push(`Error: ${report.errorMessage}`);
  }
  if (report.reviewConflictDetails.length) {
    lines.push("", "Review conflicts (manual resolution):");
    for (const conflict of report.reviewConflictDetails.slice(0, 50)) {
      lines.push(
        `- recipeId=${conflict.recipeId} author=${conflict.authorEmail} reviews=${conflict.reviewIds.join(",")} (${conflict.reason})`,
      );
    }
    if (report.reviewConflictDetails.length > 50) {
      lines.push(`… and ${report.reviewConflictDetails.length - 50} more`);
    }
  }
  return lines.join("\n");
}

function reviewsContentEquivalent(
  a: { rating: number; body: string },
  b: { rating: number; body: string },
) {
  return a.rating === b.rating && a.body.trim() === b.body.trim();
}

/**
 * Backfill nullable recipeId on saves/reviews, merge duplicate (user,recipe) saves,
 * reconcile safe review duplicates, fill FunnelEvent.recipeId when confident.
 *
 * Idempotent. Orphans and review content conflicts are preserved and reported.
 * Does not set recipeId NOT NULL and does not add (recipeId, authorEmail) unique yet
 * while conflicts may exist.
 */
export async function backfillRecipeIdentity(options?: {
  force?: boolean;
}): Promise<RecipeIdentityBackfillReport> {
  const db = getDb();
  const report = emptyReport();

  try {
    if (!options?.force) {
      const flag = await db.siteSetting.findUnique({
        where: { key: RECIPE_IDENTITY_BACKFILL_SETTING_KEY },
      });
      if (flag?.value === "done") {
        report.alreadyDone = true;
        report.status = "ALREADY_DONE";
        return report;
      }
    }

    const recipes = await db.recipe.findMany({
      select: { id: true, slug: true, title: true },
    });
    const bySlug = new Map(recipes.map((r) => [r.slug, r]));
    const byId = new Map(recipes.map((r) => [r.id, r]));

    const redirects = await db.redirect.findMany({
      where: { isActive: true },
      select: { fromPath: true, toPath: true },
    });
    const redirectToByFrom = new Map<string, string>();
    for (const row of redirects) {
      const from = normalizeRedirectPath(row.fromPath);
      const to = normalizeRedirectPath(row.toPath);
      if (from && to) redirectToByFrom.set(from, to);
    }

    // --- RecipeSave: resolve null recipeIds (slug or redirect) ---
    const allSaves = await db.recipeSave.findMany({
      orderBy: { createdAt: "asc" },
    });
    report.savesExamined = allSaves.length;

    for (const save of allSaves) {
      if (save.recipeId) continue;
      const recipe = resolveRecipeFromLegacySlug(save.slug, bySlug, redirectToByFrom);
      if (!recipe) continue;
      // Defer write until merge pass so we don't hit unique(userId,recipeId) mid-loop.
      save.recipeId = recipe.id;
      report.savesResolved += 1;
    }

    // Group by (userId, recipeId) and merge duplicates before persisting.
    const saveGroups = new Map<string, typeof allSaves>();
    for (const save of allSaves) {
      if (!save.recipeId) continue;
      const key = `${save.userId}::${save.recipeId}`;
      const list = saveGroups.get(key) || [];
      list.push(save);
      saveGroups.set(key, list);
    }

    for (const group of saveGroups.values()) {
      const recipe = byId.get(group[0]!.recipeId!);
      if (!recipe) continue;
      // Prefer earliest createdAt as “first saved”.
      group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const keep = group[0]!;
      const drop = group.slice(1);

      // Delete duplicates first so unique(userId, slug) cannot block promoting keep
      // to the current Recipe.slug (legacy: old-slug + new-slug rows for one recipe).
      for (const dup of drop) {
        await db.recipeSave.delete({ where: { id: dup.id } });
        report.savesMerged += 1;
      }

      await db.recipeSave.update({
        where: { id: keep.id },
        data: {
          recipeId: recipe.id,
          slug: recipe.slug,
          title: recipe.title || keep.title,
        },
      });
    }

    // Re-count orphans after resolution (rows still null).
    report.savesOrphaned = await db.recipeSave.count({ where: { recipeId: null } });

    // --- RecipeReview ---
    const allReviews = await db.recipeReview.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { replies: true } } },
    });
    report.reviewsExamined = allReviews.length;

    for (const review of allReviews) {
      if (review.recipeId) continue;
      const recipe = resolveRecipeFromLegacySlug(
        review.recipeSlug,
        bySlug,
        redirectToByFrom,
      );
      if (!recipe) continue;
      review.recipeId = recipe.id;
      report.reviewsResolved += 1;
    }

    const reviewGroups = new Map<string, typeof allReviews>();
    for (const review of allReviews) {
      if (!review.recipeId) continue;
      const email = review.authorEmail.trim().toLowerCase();
      const key = `${review.recipeId}::${email}`;
      const list = reviewGroups.get(key) || [];
      list.push(review);
      reviewGroups.set(key, list);
    }

    for (const group of reviewGroups.values()) {
      const recipe = byId.get(group[0]!.recipeId!);
      if (!recipe) continue;
      group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      if (group.length === 1) {
        const only = group[0]!;
        await db.recipeReview.update({
          where: { id: only.id },
          data: { recipeId: recipe.id, recipeSlug: recipe.slug },
        });
        continue;
      }

      // Multiple reviews for same author + recipe after identity resolve.
      const allEquivalent = group.every((row) =>
        reviewsContentEquivalent(row, group[0]!),
      );

      if (allEquivalent) {
        const keep = group[0]!;
        for (const dup of group.slice(1)) {
          if (dup._count.replies > 0) {
            await db.recipeReviewReply.updateMany({
              where: { reviewId: dup.id },
              data: { reviewId: keep.id },
            });
          }
          await db.recipeReview.delete({ where: { id: dup.id } });
          report.reviewsMerged += 1;
        }
        await db.recipeReview.update({
          where: { id: keep.id },
          data: { recipeId: recipe.id, recipeSlug: recipe.slug },
        });
        continue;
      }

      // Different rating/body — preserve all; report conflict.
      // Do NOT normalize recipeSlug to the same value (legacy unique is recipeSlug+email).
      for (const row of group) {
        await db.recipeReview.update({
          where: { id: row.id },
          data: { recipeId: recipe.id },
        });
      }
      report.reviewConflicts += 1;
      report.reviewConflictDetails.push({
        recipeId: recipe.id,
        authorEmail: group[0]!.authorEmail.trim().toLowerCase(),
        reviewIds: group.map((row) => row.id),
        reason: "divergent_rating_or_body",
      });
    }

    report.reviewsOrphaned = await db.recipeReview.count({ where: { recipeId: null } });

    // --- FunnelEvent soft fill ---
    const pendingFunnel = await db.funnelEvent.findMany({
      where: { recipeId: "", recipeSlug: { not: "" } },
      select: { id: true, recipeSlug: true },
    });
    report.funnelExamined = pendingFunnel.length;
    for (const event of pendingFunnel) {
      const recipe = resolveRecipeFromLegacySlug(
        event.recipeSlug,
        bySlug,
        redirectToByFrom,
      );
      if (!recipe) {
        report.funnelUnresolved += 1;
        continue;
      }
      await db.funnelEvent.update({
        where: { id: event.id },
        data: { recipeId: recipe.id },
      });
      report.funnelResolved += 1;
    }

    await db.siteSetting.upsert({
      where: { key: RECIPE_IDENTITY_BACKFILL_SETTING_KEY },
      create: { key: RECIPE_IDENTITY_BACKFILL_SETTING_KEY, value: "done" },
      update: { value: "done" },
    });

    report.status = finalizeStatus(report);
    return report;
  } catch (error) {
    report.errorMessage = error instanceof Error ? error.message : String(error);
    report.status = "FAILED";
    // Do not mark SiteSetting done on failure.
    return report;
  }
}

/**
 * @deprecated Prefer the explicit `npm run db:backfill-recipe-identity` script.
 * Kept only for emergency ops; not invoked from public request paths.
 */
export function ensureRecipeIdentityBackfill(): Promise<RecipeIdentityBackfillReport> {
  return backfillRecipeIdentity();
}
