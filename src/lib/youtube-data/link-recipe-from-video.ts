import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { parseRecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  applyYoutubeVideoLinkToValues,
  markChaptersSyncedFromYoutube,
} from "@/lib/youtube-data/recipe-link";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { buildRecipeVideoIndex, recipeMainVideoId } from "@/lib/youtube-data/matching";
import {
  findRecipeIdLinkedToVideo,
  loadSyncedVideoForLink,
  recipeHasYoutubeLink,
} from "@/lib/youtube-data/video-selector";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";

export type LinkRecipeFromVideoResult =
  | {
      ok: true;
      recipeId: string;
      recipeTitle: string;
      recipeSlug: string;
    }
  | {
      ok: false;
      code:
        | "unauthorized"
        | "video_not_found"
        | "recipe_not_found"
        | "video_already_linked"
        | "recipe_already_linked"
        | "not_published"
        | "link_failed";
      message: string;
      conflictingRecipe?: { id: string; title: string };
    };

export async function linkExistingRecipeToYoutubeVideo(input: {
  videoId: string;
  recipeId: string;
}): Promise<LinkRecipeFromVideoResult> {
  const videoId = String(input.videoId || "").trim();
  const recipeId = String(input.recipeId || "").trim();
  if (!videoId || !recipeId) {
    return { ok: false, code: "link_failed", message: "videoId and recipeId are required." };
  }

  const video = await loadSyncedVideoForLink(videoId);
  if (!video) {
    return { ok: false, code: "video_not_found", message: "YouTube video not found in Mesa sync cache." };
  }

  const db = getDb();
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { id: true, slug: true, title: true, status: true, values: true, aiMeta: true },
  });

  if (!recipe) {
    return { ok: false, code: "recipe_not_found", message: "Recipe not found." };
  }

  if (recipe.status !== "published") {
    return { ok: false, code: "not_published", message: "Only published recipes can be linked from the dashboard." };
  }

  const existingLink = await findRecipeIdLinkedToVideo(videoId, recipeId);
  if (existingLink) {
    return {
      ok: false,
      code: "video_already_linked",
      message: `This video is already linked to “${existingLink.title}”.`,
      conflictingRecipe: existingLink,
    };
  }

  if (await recipeHasYoutubeLink(recipeId)) {
    const values = parseValues(recipe.values);
    const currentVideoId = recipeMainVideoId({
      youtubeUrl: String(values.youtubeUrl ?? ""),
      youtube: parseRecipeYoutubeBlob(values.youtube),
    });
    if (currentVideoId && currentVideoId !== videoId) {
      return {
        ok: false,
        code: "recipe_already_linked",
        message: "This recipe already links to a different YouTube video.",
      };
    }
  }

  const aiMeta = parseRecipeAiMeta(recipe.aiMeta);
  const values = parseValues(recipe.values);
  const linkedValues = applyYoutubeVideoLinkToValues(values, video, { aiMeta });

  const descriptionChapters = parseYoutubeDescriptionChapters(video.description);
  let nextAiMeta = aiMeta;
  if (descriptionChapters.length) {
    nextAiMeta = markChaptersSyncedFromYoutube(aiMeta, descriptionChapters.length);
  }

  try {
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        values: JSON.stringify(linkedValues),
        aiMeta: JSON.stringify(nextAiMeta ?? {}),
      },
    });
  } catch {
    return { ok: false, code: "link_failed", message: "Could not save recipe link." };
  }

  return {
    ok: true,
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    recipeSlug: recipe.slug,
  };
}

/** Guard for API: recipe must be a published candidate without video. */
export async function validatePublishedRecipeLinkCandidate(recipeId: string): Promise<boolean> {
  const db = getDb();
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { status: true, values: true },
  });
  if (!recipe || recipe.status !== "published") return false;
  const values = parseValues(recipe.values);
  return !recipeMainVideoId({
    youtubeUrl: String(values.youtubeUrl ?? ""),
    youtube: values.youtube as never,
  });
}

export async function listPublishedRecipesWithoutVideo() {
  const { recipesWithoutVideo } = await buildRecipeVideoIndex({ includeDrafts: false });
  return recipesWithoutVideo;
}
