import type { MetadataRoute } from "next";
import { site } from "@/data/site";

/**
 * Pure sitemap membership builder — shared by `/sitemap.xml` and Site Health.
 * lastModified for recipes uses operational `updatedAt` (Phase 2 policy).
 */

export type SitemapRecipeEntry = {
  slug: string;
  updatedAt: string | Date;
};

export type SitemapCategoryEntry = { slug: string };
export type SitemapSeriesEntry = { slug: string };
export type SitemapStudioLessonEntry = { slug: string };

export type BuildSitemapEntriesInput = {
  siteUrl?: string;
  now?: Date;
  recipes: SitemapRecipeEntry[];
  categories: SitemapCategoryEntry[];
  series: SitemapSeriesEntry[];
  /** Already filtered to publicly visible lessons when Studio launch is enabled. */
  studioLessons?: SitemapStudioLessonEntry[];
  includeStudio?: boolean;
};

export function recipeSitemapPath(slug: string): string {
  return `/recipes/${String(slug || "").trim()}`;
}

export function categorySitemapPath(slug: string): string {
  return `/category/${String(slug || "").trim()}`;
}

export function seriesSitemapPath(slug: string): string {
  return `/series/${String(slug || "").trim()}`;
}

export function studioSitemapPath(slug: string): string {
  return `/studio/${String(slug || "").trim()}`;
}

/** Absolute URLs that the public sitemap should emit for the given entity set. */
export function buildSitemapEntries(
  input: BuildSitemapEntriesInput,
): MetadataRoute.Sitemap {
  const base = (input.siteUrl ?? site.url).replace(/\/$/, "");
  const now = input.now ?? new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/recipes`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/series`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/videos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${base}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${base}/disclosures`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  const recipeRoutes = input.recipes.map((recipe) => ({
    url: `${base}${recipeSitemapPath(recipe.slug)}`,
    lastModified: new Date(recipe.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  const categoryRoutes = input.categories.map((category) => ({
    url: `${base}${categorySitemapPath(category.slug)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const seriesRoutes = input.series.map((series) => ({
    url: `${base}${seriesSitemapPath(series.slug)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const lessonRoutes =
    input.includeStudio && input.studioLessons
      ? input.studioLessons.map((lesson) => ({
          url: `${base}${studioSitemapPath(lesson.slug)}`,
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.65,
        }))
      : [];

  return [
    ...staticRoutes,
    ...recipeRoutes,
    ...categoryRoutes,
    ...seriesRoutes,
    ...lessonRoutes,
  ];
}

/** Pathnames (no host) represented by a built sitemap — for health membership checks. */
export function sitemapPathnamesFromEntries(
  entries: MetadataRoute.Sitemap,
  siteUrl: string = site.url,
): string[] {
  const base = siteUrl.replace(/\/$/, "");
  const paths: string[] = [];
  for (const entry of entries) {
    const url = String(entry.url || "");
    if (url === base || url === `${base}/`) {
      paths.push("/");
      continue;
    }
    if (url.startsWith(`${base}/`)) {
      paths.push(url.slice(base.length) || "/");
    }
  }
  return paths;
}

/**
 * Intentional policy: individual `/videos/[videoId]` watch pages are indexable
 * via page metadata but are NOT listed in the sitemap.
 */
export const SITEMAP_INCLUDES_VIDEO_WATCH_PAGES = false;
