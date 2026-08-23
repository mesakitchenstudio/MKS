import type { MetadataRoute } from "next";
import { lessons } from "@/data/lessons";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";
import { getAllCategories, getAllRecipes } from "@/lib/recipes";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isSitePrivate()) {
    return [{ url: site.url, lastModified: new Date() }];
  }

  const [recipes, categories] = await Promise.all([getAllRecipes(), getAllCategories()]);

  const staticRoutes = ["", "/recipes", "/studio", "/about", "/search", "/contact", "/privacy", "/disclosures"].map(
    (path) => ({
      url: `${site.url}${path}`,
      lastModified: new Date(),
    }),
  );

  const recipeRoutes = recipes.map((recipe) => ({
    url: `${site.url}/recipes/${recipe.slug}`,
    lastModified: new Date(recipe.updatedAt),
  }));

  const categoryRoutes = categories.map((category) => ({
    url: `${site.url}/category/${category.slug}`,
    lastModified: new Date(),
  }));

  const lessonRoutes = lessons.map((lesson) => ({
    url: `${site.url}/studio/${lesson.slug}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...recipeRoutes, ...categoryRoutes, ...lessonRoutes];
}
