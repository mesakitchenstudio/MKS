import type { RecipeReviewData } from "@/lib/recipe-reviews";

export async function fetchRecipeReviewData(slug: string): Promise<RecipeReviewData> {
  const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}/reviews`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not load reviews.");
  }
  return (await response.json()) as RecipeReviewData;
}
