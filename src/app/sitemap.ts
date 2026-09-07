import type { MetadataRoute } from "next";
import { lessons } from "@/data/lessons";
import { isSitePrivate } from "@/lib/flags";
import { getAllCategories, getAllRecipes } from "@/lib/recipes";
import { listPublishedSeries } from "@/lib/series";
import { buildSitemapEntries } from "@/lib/sitemap-entries";
import { filterPubliclyVisibleLessons, isStudioPublicLaunchEnabled } from "@/lib/studio-public";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isSitePrivate()) {
    return [];
  }

  const [recipes, categories, seriesList] = await Promise.all([
    getAllRecipes(),
    getAllCategories(),
    listPublishedSeries(),
  ]);

  const includeStudio = isStudioPublicLaunchEnabled();
  const studioLessons = includeStudio
    ? filterPubliclyVisibleLessons(lessons).map((lesson) => ({ slug: lesson.slug }))
    : [];

  return buildSitemapEntries({
    recipes: recipes.map((recipe) => ({
      slug: recipe.slug,
      updatedAt: recipe.updatedAt,
    })),
    categories: categories.map((category) => ({ slug: category.slug })),
    series: seriesList.map((series) => ({ slug: series.slug })),
    studioLessons,
    includeStudio,
  });
}
