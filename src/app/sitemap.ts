import type { MetadataRoute } from "next";
import { lessons } from "@/data/lessons";
import { isCategoryIndexable } from "@/lib/category-seo";
import { isSitePrivate } from "@/lib/flags";
import { getAllCategories, getAllRecipes } from "@/lib/recipes";
import { listPublishedSeries } from "@/lib/series";
import { buildSitemapEntries } from "@/lib/sitemap-entries";
import { filterPubliclyVisibleLessons, isStudioPublicLaunchEnabled } from "@/lib/studio-public";
import { isCookWithWhatYouHaveEnabled } from "@/lib/cook-with-what-you-have";
import { getDb } from "@/lib/db";
import {
  isIngredientSeoEnabled,
  listIndexableIngredientSlugs,
} from "@/lib/ingredient-seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isSitePrivate()) {
    return [];
  }

  const [recipes, categories, seriesList] = await Promise.all([
    getAllRecipes(),
    getAllCategories(),
    listPublishedSeries(),
  ]);

  const recipeCountByCategory = new Map<string, number>();
  for (const recipe of recipes) {
    for (const slug of recipe.categories) {
      recipeCountByCategory.set(slug, (recipeCountByCategory.get(slug) || 0) + 1);
    }
  }

  const includeStudio = isStudioPublicLaunchEnabled();
  const studioLessons = includeStudio
    ? filterPubliclyVisibleLessons(lessons).map((lesson) => ({ slug: lesson.slug }))
    : [];

  let ingredients: Array<{ slug: string }> = [];
  if (isIngredientSeoEnabled()) {
    try {
      ingredients = (await listIndexableIngredientSlugs(getDb())).map((slug) => ({ slug }));
    } catch {
      ingredients = [];
    }
  }

  return buildSitemapEntries({
    recipes: recipes.map((recipe) => ({
      slug: recipe.slug,
      updatedAt: recipe.updatedAt,
    })),
    categories: categories
      .filter((category) => isCategoryIndexable(recipeCountByCategory.get(category.slug) || 0))
      .map((category) => ({ slug: category.slug })),
    series: seriesList.map((series) => ({ slug: series.slug })),
    studioLessons,
    includeStudio,
    includeCookWithWhatYouHave: isCookWithWhatYouHaveEnabled(),
    ingredients,
  });
}
