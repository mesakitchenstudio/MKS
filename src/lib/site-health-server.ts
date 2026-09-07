import "server-only";

import { lessons } from "@/data/lessons";
import { site } from "@/data/site";
import { getDb } from "@/lib/db";
import { isSitePrivate } from "@/lib/flags";
import {
  defaultSiteHealthPolicyFacts,
  runSiteHealthChecks,
  type SiteHealthResult,
} from "@/lib/site-health";
import { filterPubliclyVisibleLessons, isStudioPublicLaunchEnabled } from "@/lib/studio-public";

/**
 * Load Site / SEO Health from repository truth.
 * Bounded queries — no per-page HTTP, no crawler, no side effects.
 */
export async function loadSiteHealth(): Promise<SiteHealthResult> {
  const db = getDb();
  const studioEnabled = isStudioPublicLaunchEnabled();

  const [redirects, recipes, categories, series] = await Promise.all([
    db.redirect.findMany({
      select: {
        id: true,
        fromPath: true,
        toPath: true,
        isActive: true,
        source: true,
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
    db.recipe.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        scheduledPublishAt: true,
        updatedAt: true,
      },
    }),
    db.category.findMany({
      select: { id: true, slug: true, name: true },
    }),
    db.series.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        isPublished: true,
        items: {
          select: {
            id: true,
            removedFromPlaylist: true,
            recipeId: true,
            recipe: { select: { status: true } },
            youtubeVideoId: true,
            youtubeVideo: { select: { privacyStatus: true } },
          },
        },
      },
    }),
  ]);

  const studioLessons = studioEnabled
    ? filterPubliclyVisibleLessons(lessons).map((lesson) => ({ slug: lesson.slug }))
    : [];

  return runSiteHealthChecks({
    siteUrl: site.url,
    sitePrivate: isSitePrivate(),
    studioPublicLaunchEnabled: studioEnabled,
    // site.url is the production canonical host config (not preview/runtime host).
    productionLike: true,
    redirects,
    recipes,
    categories,
    series: series.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      isPublished: row.isPublished,
      items: row.items.map((item) => ({
        id: item.id,
        removedFromPlaylist: item.removedFromPlaylist,
        recipeId: item.recipeId,
        recipeStatus: item.recipe?.status ?? null,
        youtubeVideoId: item.youtubeVideoId,
        youtubePrivacyStatus: item.youtubeVideo?.privacyStatus ?? null,
      })),
    })),
    studioLessons,
    policy: defaultSiteHealthPolicyFacts(),
  });
}
