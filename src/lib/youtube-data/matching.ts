import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { youtubeVideoId } from "@/lib/youtube";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";

export type RecipeVideoLink = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  videoId: string;
  youtubeBlob: ReturnType<typeof parseRecipeYoutubeBlob>;
};

export type RecipeVideoRow = {
  id: string;
  slug: string;
  title: string;
  youtubeUrl?: string;
  youtube?: ReturnType<typeof parseRecipeYoutubeBlob>;
};

async function loadRecipeVideoRows(options?: { includeDrafts?: boolean }): Promise<RecipeVideoRow[]> {
  const db = getDb();
  const rows = await db.recipe.findMany({
    where: options?.includeDrafts ? undefined : { status: "published" },
    select: { id: true, slug: true, title: true, values: true, status: true },
    orderBy: { title: "asc" },
  });

  return rows.map((row) => {
    const values = parseValues(row.values);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      youtubeUrl: typeof values.youtubeUrl === "string" ? values.youtubeUrl : undefined,
      youtube: parseRecipeYoutubeBlob(values.youtube),
    };
  });
}

export function recipeMainVideoId(recipe: Pick<RecipeVideoRow, "youtubeUrl" | "youtube">): string | null {
  const fromUrl = youtubeVideoId(String(recipe.youtubeUrl ?? ""));
  if (fromUrl) return fromUrl;
  const blob = recipe.youtube;
  if (blob?.videoId) return blob.videoId;
  if (blob?.url) return youtubeVideoId(blob.url);
  return null;
}

export async function buildRecipeVideoIndex(options?: { includeDrafts?: boolean }): Promise<{
  byVideoId: Map<string, RecipeVideoLink>;
  recipesWithVideo: RecipeVideoLink[];
  recipesWithoutVideo: Pick<RecipeVideoRow, "id" | "slug" | "title">[];
  recipes: RecipeVideoRow[];
}> {
  const recipes = await loadRecipeVideoRows(options);
  const byVideoId = new Map<string, RecipeVideoLink>();
  const recipesWithVideo: RecipeVideoLink[] = [];
  const recipesWithoutVideo: Pick<RecipeVideoRow, "id" | "slug" | "title">[] = [];

  for (const recipe of recipes) {
    const videoId = recipeMainVideoId(recipe);
    if (!videoId) {
      recipesWithoutVideo.push({ id: recipe.id, slug: recipe.slug, title: recipe.title });
      continue;
    }
    const link: RecipeVideoLink = {
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
      videoId,
      youtubeBlob: recipe.youtube ?? null,
    };
    recipesWithVideo.push(link);
    if (!byVideoId.has(videoId)) {
      byVideoId.set(videoId, link);
    }
  }

  return { byVideoId, recipesWithVideo, recipesWithoutVideo, recipes };
}

export function recipeHasSavedChapters(recipe: Pick<RecipeVideoRow, "youtube">): boolean {
  return Boolean(recipe.youtube?.timestamps?.length);
}

export function normalizeTitleForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesDifferSignificantly(a: string, b: string): boolean {
  const left = normalizeTitleForCompare(a);
  const right = normalizeTitleForCompare(b);
  if (!left || !right) return false;
  if (left === right) return false;
  if (left.includes(right) || right.includes(left)) return false;
  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));
  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1;
  }
  const ratio = overlap / Math.max(leftWords.size, rightWords.size);
  return ratio < 0.45;
}
