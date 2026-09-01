import type { MetadataRoute } from "next";
import { lessons } from "@/data/lessons";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";
import { getAllCategories, getAllRecipes } from "@/lib/recipes";
import { listPublishedSeries } from "@/lib/series";
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
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: site.url,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${site.url}/recipes`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${site.url}/series`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${site.url}/videos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${site.url}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${site.url}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${site.url}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${site.url}/disclosures`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  const recipeRoutes = recipes.map((recipe) => ({
    url: `${site.url}/recipes/${recipe.slug}`,
    lastModified: new Date(recipe.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  const categoryRoutes = categories.map((category) => ({
    url: `${site.url}/category/${category.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const seriesRoutes = seriesList.map((series) => ({
    url: `${site.url}/series/${series.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const lessonRoutes = isStudioPublicLaunchEnabled()
    ? filterPubliclyVisibleLessons(lessons).map((lesson) => ({
        url: `${site.url}/studio/${lesson.slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.65,
      }))
    : [];

  return [...staticRoutes, ...recipeRoutes, ...categoryRoutes, ...seriesRoutes, ...lessonRoutes];
}
