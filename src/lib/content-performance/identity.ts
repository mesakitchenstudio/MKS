/**
 * Deterministic path → content identity resolution for Unified Performance.
 * Pure / in-memory after batch context load. Does not mutate Redirects or GSC rows.
 */

import { classifySearchConsolePath } from "@/lib/search-console/paths";
import {
  normalizeRedirectPath,
  recipePublicPath,
  REDIRECT_MAX_HOPS,
  resolveRedirectChain,
} from "@/lib/redirects";
import type { PerformanceEntityRef } from "@/lib/content-performance/types";

export type PerformanceRecipeRef = {
  id: string;
  slug: string;
  title: string;
  status: string;
};

export type PerformanceSeriesRef = {
  id: string;
  slug: string;
  title: string;
  status: string;
};

export type PerformanceIdentityContext = {
  recipesBySlug: Map<string, PerformanceRecipeRef>;
  recipesById: Map<string, PerformanceRecipeRef>;
  seriesBySlug: Map<string, PerformanceSeriesRef>;
  seriesById: Map<string, PerformanceSeriesRef>;
  /** Active redirect fromPath → toPath (already normalized). */
  redirectToByFrom: Map<string, string>;
};

export type ResolvedPerformancePath =
  | { status: "resolved"; entity: PerformanceEntityRef; finalPath: string }
  | { status: "unresolved"; path: string; reason: string };

function lookupRedirect(map: Map<string, string>, path: string) {
  const toPath = map.get(path);
  if (!toPath) return null;
  return { toPath, isActive: true };
}

/** Extract recipe slug from `/recipes/{slug}` (not cook / nested). */
export function parseRecipeDetailPath(path: string): string | null {
  const normalized = normalizeRedirectPath(path) || path.trim();
  const match = normalized.match(/^\/recipes\/([^/]+)$/);
  return match?.[1] || null;
}

/** Cooking Mode is a deliberate subroute — excluded from ordinary Recipe page views. */
export function isRecipeCookPath(path: string): boolean {
  const normalized = normalizeRedirectPath(path) || path.trim();
  return /^\/recipes\/[^/]+\/cook$/.test(normalized);
}

export function parseSeriesDetailPath(path: string): string | null {
  const normalized = normalizeRedirectPath(path) || path.trim();
  const match = normalized.match(/^\/series\/([^/]+)$/);
  return match?.[1] || null;
}

function entityForFinalPath(
  finalPath: string,
  ctx: PerformanceIdentityContext,
): PerformanceEntityRef | null {
  const recipeSlug = parseRecipeDetailPath(finalPath);
  if (recipeSlug) {
    const recipe = ctx.recipesBySlug.get(recipeSlug);
    if (recipe) return { kind: "recipe", recipeId: recipe.id };
    return null;
  }

  const seriesSlug = parseSeriesDetailPath(finalPath);
  if (seriesSlug) {
    const series = ctx.seriesBySlug.get(seriesSlug);
    if (series) return { kind: "series", seriesId: series.id };
  }

  const routeKind = classifySearchConsolePath(finalPath);
  return { kind: "page", path: finalPath, routeKind };
}

/**
 * Resolution order for Mesa paths:
 * A. Normalize path
 * B. Direct Recipe/Series lookup by current slug
 * C. Follow Redirect Manager (cycle/hop-safe)
 * D. Classify final path
 * E. Else unresolved
 *
 * Non-Mesa / empty paths → unresolved.
 * Never fuzzy-match titles or Google queries.
 */
export function resolvePerformancePath(
  path: string,
  ctx: PerformanceIdentityContext,
): ResolvedPerformancePath {
  const normalized = normalizeRedirectPath(path);
  if (!normalized) {
    return { status: "unresolved", path: String(path || ""), reason: "invalid_path" };
  }

  // Direct current Recipe / Series before redirects.
  const directRecipeSlug = parseRecipeDetailPath(normalized);
  if (directRecipeSlug) {
    const recipe = ctx.recipesBySlug.get(directRecipeSlug);
    if (recipe) {
      return {
        status: "resolved",
        entity: { kind: "recipe", recipeId: recipe.id },
        finalPath: recipePublicPath(recipe.slug),
      };
    }
  }

  const directSeriesSlug = parseSeriesDetailPath(normalized);
  if (directSeriesSlug) {
    const series = ctx.seriesBySlug.get(directSeriesSlug);
    if (series) {
      return {
        status: "resolved",
        entity: { kind: "series", seriesId: series.id },
        finalPath: `/series/${series.slug}`,
      };
    }
  }

  // Known static / hub pages resolve as page entities without redirects.
  const directKind = classifySearchConsolePath(normalized);
  const isKnownStatic =
    normalized === "/" ||
    normalized === "/recipes" ||
    normalized === "/videos" ||
    normalized === "/series" ||
    normalized === "/studio" ||
    directKind === "category" ||
    directKind === "studio" ||
    directKind === "video_hub" ||
    directKind === "video";

  if (isKnownStatic && !directRecipeSlug && !directSeriesSlug) {
    return {
      status: "resolved",
      entity: { kind: "page", path: normalized, routeKind: directKind },
      finalPath: normalized,
    };
  }

  const redirected = resolveRedirectChain(normalized, (p) =>
    lookupRedirect(ctx.redirectToByFrom, p),
  );

  if (redirected) {
    const entity = entityForFinalPath(redirected, ctx);
    if (entity?.kind === "recipe" || entity?.kind === "series") {
      return { status: "resolved", entity, finalPath: redirected };
    }
    if (entity?.kind === "page") {
      return { status: "resolved", entity, finalPath: redirected };
    }
    return {
      status: "unresolved",
      path: normalized,
      reason: "redirect_target_unresolved",
    };
  }

  // Recipe-looking path with no current recipe and no redirect.
  if (directRecipeSlug || directSeriesSlug) {
    return {
      status: "unresolved",
      path: normalized,
      reason: "missing_content_or_redirect",
    };
  }

  // Other Mesa paths without identity.
  return {
    status: "unresolved",
    path: normalized,
    reason: "unclassified",
  };
}

/** Collect all historical paths that resolve to a Recipe id (for URL history UX). */
export function collectPathsForRecipe(
  recipeId: string,
  candidatePaths: Iterable<string>,
  ctx: PerformanceIdentityContext,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of candidatePaths) {
    const resolved = resolvePerformancePath(path, ctx);
    if (resolved.status !== "resolved") continue;
    if (resolved.entity.kind !== "recipe") continue;
    if (resolved.entity.recipeId !== recipeId) continue;
    const key = normalizeRedirectPath(path) || path;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export { REDIRECT_MAX_HOPS, recipePublicPath, normalizeRedirectPath };
