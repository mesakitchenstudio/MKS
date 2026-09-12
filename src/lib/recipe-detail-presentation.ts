import "server-only";

import { connection } from "next/server";
import { auth } from "@/auth";
import { getAdminSession } from "@/lib/auth";
import { canManageRecipeReviewReplies, getRecipeReviewData } from "@/lib/recipe-reviews";
import { resolveRecipeYoutube, resolveRecipeYoutubeForDisplay } from "@/lib/recipe-youtube";
import { recipeInstructionStages } from "@/lib/recipe-instructions";
import { selectStageVideoHelp } from "@/lib/recipe-stage-video-help";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";
import { getContinuedViewingRecipeSlug, getRankedRelatedRecipes } from "@/lib/recipe-related";
import { RELATED_RECIPE_SHELF_LIMIT } from "@/lib/recipe-related-shelf";
import { parseRelatedRecipeIds } from "@/lib/recipe-related-overrides";
import { dbAvailable, getDb } from "@/lib/db";
import { getWatchNextRecommendation } from "@/lib/youtube-data/watch-next";
import { getSeriesLinksForRecipeSlug, getSeriesPeerRecipeSlugs } from "@/lib/series";
import { getRelatedLessonsForRecipeSlug } from "@/lib/studio-recipe-links";
import type { PublicRecipe } from "@/lib/recipes";
import type { RecipeDetailViewProps } from "@/components/recipe/RecipeDetailView";

function parseDurationSecondsFromDisplay(duration?: string) {
  if (!duration?.trim()) return undefined;
  return parseTimestampInput(duration) ?? undefined;
}

/**
 * Shared enrichment for public recipe page and Admin preview.
 * Related/series shelves remain published-catalogue based.
 */
export async function loadRecipeDetailPresentation(
  recipe: PublicRecipe,
  options?: { reviewQuery?: string | null },
): Promise<Omit<RecipeDetailViewProps, "mode">> {
  const [seriesLinks, seriesPeerSlugs, session, admin] = await Promise.all([
    getSeriesLinksForRecipeSlug(recipe.slug),
    getSeriesPeerRecipeSlugs(recipe.slug),
    auth(),
    getAdminSession(),
  ]);

  const canStaffReply =
    Boolean(admin && canManageRecipeReviewReplies(admin.role)) ||
    Boolean(session?.staffRole && canManageRecipeReviewReplies(session.staffRole));
  const reviewData = await getRecipeReviewData(recipe.slug, {
    canStaffReply,
    email: session?.user?.email ?? null,
    userId: session?.user?.id ?? null,
  });
  const targetReviewId = options?.reviewQuery?.trim() || null;
  const verifiedTargetReviewId =
    targetReviewId && reviewData.reviews.some((review) => review.id === targetReviewId)
      ? targetReviewId
      : null;

  const studioLessons = await getRelatedLessonsForRecipeSlug(recipe.slug);

  const baseYoutube = resolveRecipeYoutube(recipe);
  if (baseYoutube && !(baseYoutube.timestamps?.length ?? 0)) {
    await connection();
  }
  const youtube = await resolveRecipeYoutubeForDisplay(recipe);
  const watchNext = youtube
    ? await getWatchNextRecommendation({
        currentVideoId: youtube.videoId,
        currentRecipeSlug: recipe.slug,
        currentCategories: recipe.categories,
        curatedRelated: youtube.relatedVideos,
      })
    : null;

  const continuedSlug = getContinuedViewingRecipeSlug(watchNext, seriesLinks);
  let manualRelatedIds: string[] = [];
  const recipeDbId = recipe.id?.trim();
  if (recipeDbId && (await dbAvailable())) {
    const relatedRow = await getDb().recipe.findUnique({
      where: { id: recipeDbId },
      select: { relatedRecipeIds: true },
    });
    manualRelatedIds = parseRelatedRecipeIds(relatedRow?.relatedRecipeIds);
  }
  const related = await getRankedRelatedRecipes(recipe, {
    seriesPeerSlugs,
    limit: RELATED_RECIPE_SHELF_LIMIT,
    excludeSlugs: continuedSlug ? [continuedSlug] : [],
    manualRelatedIds,
  });
  const initialStageVideoHelp = youtube
    ? selectStageVideoHelp(
        recipeInstructionStages(recipe),
        youtube.timestamps,
        youtube.stageAlignments,
        recipe.instructions,
        parseDurationSecondsFromDisplay(youtube.duration),
      )
    : {};

  return {
    recipe,
    seriesLinks,
    reviewData,
    youtube,
    watchNext,
    related,
    studioLessons,
    initialStageVideoHelp,
    defaultName: session?.user?.name ?? admin?.name ?? "",
    defaultEmail: session?.user?.email ?? admin?.email ?? "",
    verifiedTargetReviewId,
  };
}
