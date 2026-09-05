import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { youtubeVideoId } from "@/lib/youtube";
import { getDb } from "@/lib/db";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
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
  /** Public/recipe-link label: dishName when trustworthy, else title. */
  displayTitle: string;
  status: string;
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
    const dishName = readEditorialDishName(values);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      /** Editorial link label: trustworthy dishName → canonical title. */
      displayTitle: resolveRecipeCardTitle({ title: row.title, dishName }),
      status: row.status,
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
      recipeTitle: recipe.displayTitle,
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

export function titleTokenOverlapRatio(a: string, b: string): number {
  const left = normalizeTitleForCompare(a);
  const right = normalizeTitleForCompare(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 1;
  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));
  if (!leftWords.size || !rightWords.size) return 0;
  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(leftWords.size, rightWords.size);
}

export function titlesDifferSignificantly(a: string, b: string): boolean {
  return titleTokenOverlapRatio(a, b) < 0.45;
}

/**
 * Conservative possible-match suggestion for unlinked videos.
 * Candidates must be published recipes without an existing video link.
 * Never auto-links — suggestion only.
 */
export function suggestRecipeMatchForVideo(
  videoTitle: string,
  candidates: Pick<RecipeVideoRow, "id" | "slug" | "title">[],
): Pick<RecipeVideoRow, "id" | "slug" | "title"> | null {
  let best: Pick<RecipeVideoRow, "id" | "slug" | "title"> | null = null;
  let bestRatio = 0;

  for (const candidate of candidates) {
    const ratio = titleTokenOverlapRatio(videoTitle, candidate.title);
    if (ratio < 0.45) continue;
    if (ratio > bestRatio || (ratio === bestRatio && candidate.title.length < (best?.title.length ?? Infinity))) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  return best;
}
