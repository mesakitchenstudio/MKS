import type { MetadataRoute } from "next";
import { categories } from "@/data/categories";
import { lessons } from "@/data/lessons";
import { site } from "@/data/site";
import { getAllRecipes } from "@/lib/recipes";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/recipes", "/studio", "/about", "/search", "/contact", "/privacy", "/disclosures"].map(
    (path) => ({
      url: `${site.url}${path}`,
      lastModified: new Date(),
    }),
  );

  const recipeRoutes = getAllRecipes().map((recipe) => ({
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
