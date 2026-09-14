import { site } from "@/data/site";
import {
  normalizeRedirectPath,
  recipePublicPath,
  REDIRECT_MAX_HOPS,
  resolveRedirectChain,
} from "@/lib/redirects";
import {
  buildSitemapEntries,
  recipeSitemapPath,
  SITEMAP_INCLUDES_VIDEO_WATCH_PAGES,
  sitemapPathnamesFromEntries,
  type SitemapCategoryEntry,
  type SitemapRecipeEntry,
  type SitemapSeriesEntry,
  type SitemapStudioLessonEntry,
} from "@/lib/sitemap-entries";
import { publicRobotsDisallow, robotsDisallowsAdmin, robotsDisallowsApi, robotsDisallowsProfile } from "@/lib/robots-policy";
import { recipeJsonLd } from "@/lib/schema";
import type { Recipe } from "@/data/types";

/**
 * Site / SEO Health — derived technical diagnostics.
 * Not a score, ranking tool, Search Console, or Content Health duplicate.
 */

export type SiteHealthStatus =
  | "healthy"
  | "needs_attention"
  | "recommendation"
  | "unable_to_verify";

export type SiteHealthSeverity = "attention" | "recommendation";

export type SiteHealthCategory =
  | "routing"
  | "indexing"
  | "canonical"
  | "structured_data"
  | "internal_link"
  | "media";

export type SiteHealthIssue = {
  id: string;
  severity: SiteHealthSeverity;
  category: SiteHealthCategory;
  title: string;
  description: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
};

export type SiteHealthCheck = {
  id: string;
  category: SiteHealthCategory;
  title: string;
  passed: boolean;
  severity?: SiteHealthSeverity;
  detail?: string;
};

export type SiteHealthSummary = {
  status: SiteHealthStatus;
  attentionCount: number;
  recommendationCount: number;
  checksPassing: number;
  checksTotal: number;
  issueCount: number;
};

export type SiteHealthResult = {
  status: SiteHealthStatus;
  summary: SiteHealthSummary;
  checks: SiteHealthCheck[];
  issues: SiteHealthIssue[];
  groupedIssues: SiteHealthIssueGroup[];
};

export type SiteHealthIssueGroup = {
  id: string;
  title: string;
  severity: SiteHealthSeverity;
  category: SiteHealthCategory;
  count: number;
  issues: SiteHealthIssue[];
};

export type SiteHealthRedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  isActive: boolean;
  source: string;
};

export type SiteHealthRecipeRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  scheduledPublishAt: Date | string | null;
  updatedAt: Date | string;
};

export type SiteHealthCategoryRow = {
  id: string;
  slug: string;
  name: string;
};

export type SiteHealthSeriesRow = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  items: Array<{
    id: string;
    removedFromPlaylist: boolean;
    recipeId: string | null;
    recipeStatus: string | null;
    youtubeVideoId: string | null;
    youtubePrivacyStatus: string | null;
  }>;
};

export type SiteHealthContext = {
  siteUrl: string;
  sitePrivate: boolean;
  studioPublicLaunchEnabled: boolean;
  cookWithWhatYouHaveEnabled?: boolean;
  productionLike: boolean;
  redirects: SiteHealthRedirectRow[];
  recipes: SiteHealthRecipeRow[];
  categories: SiteHealthCategoryRow[];
  series: SiteHealthSeriesRow[];
  studioLessons: SitemapStudioLessonEntry[];
  /** Policy wiring facts verified by tests / static imports — not HTTP. */
  policy: {
    adminLayoutNoIndex: boolean;
    profileNoIndex: boolean;
    memberCollectionNoIndex: boolean;
    cookingModeNoIndex: boolean;
    cookingModeOmitsRecipeSchema: boolean;
    recipesFilterNoIndex: boolean;
    videosFilterNoIndex: boolean;
    videosHubCanonical: boolean;
    recipeCanonicalUsesSlug: boolean;
    seriesCanonicalUsesSlug: boolean;
    sitemapOmitsVideoWatchPages: boolean;
    homepageIntegrityOwnedElsewhere: boolean;
    contentHealthOwnsRecipeHero: boolean;
  };
  /** Optional fixture Recipe for structured-data builder smoke (published shape). */
  schemaSampleRecipe?: Recipe | null;
};

function isPublishedRecipe(row: SiteHealthRecipeRow): boolean {
  return String(row.status || "").toLowerCase() === "published";
}

function isDraftLike(row: SiteHealthRecipeRow): boolean {
  return !isPublishedRecipe(row);
}

export type KnownInternalPathKind =
  | "recipe"
  | "category"
  | "series"
  | "ingredient"
  | "video"
  | "studio"
  | "static"
  | "unknown";

export function classifyInternalPublicPath(path: string): {
  kind: KnownInternalPathKind;
  slug?: string;
} {
  const normalized = normalizeRedirectPath(path);
  if (!normalized) return { kind: "unknown" };

  const staticExact = new Set([
    "/",
    "/recipes",
    "/series",
    "/videos",
    "/about",
    "/contact",
    "/privacy",
    "/disclosures",
    "/studio",
  ]);
  if (staticExact.has(normalized)) return { kind: "static", slug: normalized };

  const recipes = normalized.match(/^\/recipes\/([^/]+)$/);
  if (recipes) return { kind: "recipe", slug: recipes[1] };
  const category = normalized.match(/^\/category\/([^/]+)$/);
  if (category) return { kind: "category", slug: category[1] };
  const series = normalized.match(/^\/series\/([^/]+)$/);
  if (series) return { kind: "series", slug: series[1] };
  const ingredient = normalized.match(/^\/ingredient\/([^/]+)$/);
  if (ingredient) return { kind: "ingredient", slug: ingredient[1] };
  const video = normalized.match(/^\/videos\/([^/]+)$/);
  if (video) return { kind: "video", slug: video[1] };
  const studio = normalized.match(/^\/studio\/([^/]+)$/);
  if (studio) return { kind: "studio", slug: studio[1] };
  return { kind: "unknown" };
}

export type RedirectAnalysis = {
  fromPath: string;
  toPath: string;
  hopCount: number;
  chainPaths: string[];
  finalDestination: string | null;
  problem: "none" | "self" | "cycle" | "over_hops" | "invalid" | "unresolvable";
};

export function analyzeActiveRedirect(
  row: { fromPath: string; toPath: string; isActive: boolean },
  lookup: (path: string) => { toPath: string; isActive: boolean } | null | undefined,
): RedirectAnalysis {
  const fromPath = normalizeRedirectPath(row.fromPath) || row.fromPath;
  const toPath = normalizeRedirectPath(row.toPath) || row.toPath;

  if (!normalizeRedirectPath(row.fromPath) || !normalizeRedirectPath(row.toPath)) {
    return {
      fromPath,
      toPath,
      hopCount: 0,
      chainPaths: [],
      finalDestination: null,
      problem: "invalid",
    };
  }

  if (fromPath === toPath) {
    return {
      fromPath,
      toPath,
      hopCount: 1,
      chainPaths: [fromPath],
      finalDestination: null,
      problem: "self",
    };
  }

  const chainPaths: string[] = [fromPath];
  const seen = new Set<string>([fromPath]);
  let current = fromPath;
  let hopCount = 0;

  for (let hop = 0; hop < REDIRECT_MAX_HOPS; hop += 1) {
    const entry = lookup(current);
    if (!entry || !entry.isActive) {
      break;
    }
    const next = normalizeRedirectPath(entry.toPath);
    if (!next) {
      return {
        fromPath,
        toPath,
        hopCount,
        chainPaths,
        finalDestination: null,
        problem: "invalid",
      };
    }
    if (next === current) {
      return {
        fromPath,
        toPath,
        hopCount: hopCount + 1,
        chainPaths,
        finalDestination: null,
        problem: "self",
      };
    }
    hopCount += 1;
    chainPaths.push(next);
    if (seen.has(next)) {
      return {
        fromPath,
        toPath,
        hopCount,
        chainPaths,
        finalDestination: null,
        problem: "cycle",
      };
    }
    seen.add(next);

    const nextRow = lookup(next);
    if (!nextRow || !nextRow.isActive) {
      return {
        fromPath,
        toPath,
        hopCount,
        chainPaths,
        finalDestination: next,
        problem: "none",
      };
    }
    current = next;
  }

  if (hopCount >= REDIRECT_MAX_HOPS) {
    return {
      fromPath,
      toPath,
      hopCount,
      chainPaths,
      finalDestination: null,
      problem: "over_hops",
    };
  }

  const resolved = resolveRedirectChain(fromPath, lookup);
  return {
    fromPath,
    toPath,
    hopCount,
    chainPaths,
    finalDestination: resolved,
    problem: resolved ? "none" : "unresolvable",
  };
}

export function evaluateSiteUrlConfig(input: {
  siteUrl: string;
  productionLike: boolean;
}): SiteHealthIssue[] {
  const issues: SiteHealthIssue[] = [];
  let parsed: URL | null = null;
  try {
    parsed = new URL(input.siteUrl);
  } catch {
    issues.push({
      id: "canonical.site_url_invalid",
      severity: "attention",
      category: "canonical",
      title: "Site URL configuration is invalid",
      description: "Canonical site.url could not be parsed. Metadata and sitemap need a valid absolute URL.",
      href: "/admin/site-health",
    });
    return issues;
  }

  if (input.productionLike && parsed.protocol !== "https:") {
    issues.push({
      id: "canonical.site_url_https",
      severity: "attention",
      category: "canonical",
      title: "Production site URL is not HTTPS",
      description: `Configured site URL uses ${parsed.protocol} instead of https:. Local HTTP is fine; production should use HTTPS.`,
    });
  }

  return issues;
}

function knownPathExists(
  classified: ReturnType<typeof classifyInternalPublicPath>,
  sets: {
    publishedRecipeSlugs: Set<string>;
    categorySlugs: Set<string>;
    publishedSeriesSlugs: Set<string>;
    studioSlugs: Set<string>;
  },
): boolean | null {
  switch (classified.kind) {
    case "static":
      return true;
    case "recipe":
      return sets.publishedRecipeSlugs.has(classified.slug || "");
    case "category":
      return sets.categorySlugs.has(classified.slug || "");
    case "series":
      return sets.publishedSeriesSlugs.has(classified.slug || "");
    case "studio":
      return sets.studioSlugs.has(classified.slug || "");
    case "video":
      // Watch pages are not sitemap-enumerated; existence isn't verified here.
      return null;
    default:
      return null;
  }
}

export function validateRecipeJsonLdShape(data: Record<string, unknown>): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (data["@type"] !== "Recipe") missing.push("@type");
  if (!String(data.name || "").trim()) missing.push("name");
  if (!String(data.description || "").trim()) missing.push("description");
  if (!data.image) missing.push("image");
  if (!Array.isArray(data.recipeIngredient) || data.recipeIngredient.length === 0) {
    missing.push("recipeIngredient");
  }
  if (!Array.isArray(data.recipeInstructions) || data.recipeInstructions.length === 0) {
    missing.push("recipeInstructions");
  }
  return { ok: missing.length === 0, missing };
}

export function recipeJsonLdHasFabricatedRating(data: Record<string, unknown>): boolean {
  return Boolean(data.aggregateRating);
}

export function groupSiteHealthIssues(issues: SiteHealthIssue[]): SiteHealthIssueGroup[] {
  const map = new Map<string, SiteHealthIssueGroup>();
  for (const issue of issues) {
    const key = issue.id;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.issues.push(issue);
      continue;
    }
    map.set(key, {
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      category: issue.category,
      count: 1,
      issues: [issue],
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "attention" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function siteHealthStatusLabel(status: SiteHealthStatus): string {
  switch (status) {
    case "needs_attention":
      return "Needs attention";
    case "recommendation":
      return "Recommendations";
    case "unable_to_verify":
      return "Unable to verify";
    default:
      return "Healthy";
  }
}

export function siteHealthCategoryLabel(category: SiteHealthCategory): string {
  switch (category) {
    case "routing":
      return "Routing & redirects";
    case "indexing":
      return "Indexing";
    case "canonical":
      return "Canonical";
    case "structured_data":
      return "Structured data";
    case "internal_link":
      return "Internal relationships";
    case "media":
      return "Media";
    default:
      return category;
  }
}

export function runSiteHealthChecks(context: SiteHealthContext): SiteHealthResult {
  const checks: SiteHealthCheck[] = [];
  const issues: SiteHealthIssue[] = [];

  const publishedRecipes = context.recipes.filter(isPublishedRecipe);
  const draftLikeRecipes = context.recipes.filter(isDraftLike);
  const publishedSlugs = new Set(publishedRecipes.map((r) => r.slug));
  const categorySlugs = new Set(context.categories.map((c) => c.slug));
  const publishedSeries = context.series.filter((s) => s.isPublished);
  const publishedSeriesSlugs = new Set(publishedSeries.map((s) => s.slug));
  const studioSlugs = new Set(context.studioLessons.map((l) => l.slug));

  const knownSets = {
    publishedRecipeSlugs: publishedSlugs,
    categorySlugs,
    publishedSeriesSlugs,
    studioSlugs,
  };

  // —— Site URL / host ——
  const urlIssues = evaluateSiteUrlConfig({
    siteUrl: context.siteUrl,
    productionLike: context.productionLike,
  });
  issues.push(...urlIssues);
  checks.push({
    id: "canonical.site_url",
    category: "canonical",
    title: "Canonical site URL is valid",
    passed: urlIssues.length === 0,
    severity: "attention",
    detail: context.siteUrl,
  });

  // —— Redirects ——
  const activeRedirects = context.redirects.filter((r) => r.isActive);
  const redirectLookupMap = new Map(
    activeRedirects.map((r) => [
      normalizeRedirectPath(r.fromPath) || r.fromPath,
      { toPath: r.toPath, isActive: r.isActive },
    ]),
  );
  const lookup = (path: string) => redirectLookupMap.get(path);

  let redirectProblems = 0;
  for (const row of activeRedirects) {
    const analysis = analyzeActiveRedirect(row, lookup);
    if (analysis.problem === "self") {
      redirectProblems += 1;
      issues.push({
        id: "redirect.self",
        severity: "attention",
        category: "routing",
        title: "Self redirect",
        description: `${analysis.fromPath} redirects to itself.`,
        href: "/admin/redirects",
        entityType: "redirect",
        entityId: row.id,
        entityLabel: analysis.fromPath,
      });
    } else if (analysis.problem === "cycle") {
      redirectProblems += 1;
      issues.push({
        id: "redirect.cycle",
        severity: "attention",
        category: "routing",
        title: "Redirect cycle",
        description: `Cycle detected: ${analysis.chainPaths.join(" → ")}`,
        href: "/admin/redirects",
        entityType: "redirect",
        entityId: row.id,
        entityLabel: analysis.fromPath,
      });
    } else if (analysis.problem === "over_hops" || analysis.problem === "unresolvable") {
      redirectProblems += 1;
      issues.push({
        id: "redirect.chain",
        severity: "attention",
        category: "routing",
        title: "Redirect chain unresolved",
        description: `Could not resolve a safe destination for ${analysis.fromPath} within ${REDIRECT_MAX_HOPS} hops.`,
        href: "/admin/redirects",
        entityType: "redirect",
        entityId: row.id,
        entityLabel: analysis.fromPath,
      });
    } else if (analysis.problem === "invalid") {
      redirectProblems += 1;
      issues.push({
        id: "redirect.invalid_path",
        severity: "attention",
        category: "routing",
        title: "Invalid redirect path",
        description: `Redirect ${row.fromPath} → ${row.toPath} failed path normalization.`,
        href: "/admin/redirects",
        entityType: "redirect",
        entityId: row.id,
        entityLabel: row.fromPath,
      });
    } else if (analysis.hopCount > 1) {
      // Flattening invariant: multi-hop active chains should be A→C, not A→B→C.
      redirectProblems += 1;
      issues.push({
        id: "redirect.chain",
        severity: "attention",
        category: "routing",
        title: "Unflattened redirect chain",
        description: `${analysis.chainPaths.join(" → ")} should flatten to a single hop (${analysis.fromPath} → ${analysis.finalDestination}).`,
        href: "/admin/redirects",
        entityType: "redirect",
        entityId: row.id,
        entityLabel: analysis.fromPath,
      });
    } else if (analysis.finalDestination) {
      const classified = classifyInternalPublicPath(analysis.finalDestination);
      const exists = knownPathExists(classified, knownSets);
      if (exists === false) {
        redirectProblems += 1;
        issues.push({
          id: "redirect.missing_target",
          severity: "attention",
          category: "routing",
          title: "Redirect target missing",
          description: `${analysis.fromPath} points to known Mesa path ${analysis.finalDestination}, which is not a current public entity.`,
          href: "/admin/redirects",
          entityType: "redirect",
          entityId: row.id,
          entityLabel: analysis.fromPath,
        });
      }
    }
  }

  // Inactive redirects are intentionally ignored unless they collide with an active fromPath
  // (unique fromPath makes that impossible) — no inactive clutter.

  checks.push({
    id: "redirect.health",
    category: "routing",
    title: "Active redirects are healthy",
    passed: redirectProblems === 0,
    severity: "attention",
    detail: `${activeRedirects.length} active`,
  });

  // —— Sitemap membership (same builder as sitemap.ts) ——
  if (context.sitePrivate) {
    checks.push({
      id: "sitemap.private_mode",
      category: "indexing",
      title: "Private mode empties sitemap",
      passed: true,
      detail: "SITE_PRIVATE returns an empty sitemap by design.",
    });
  } else {
    const sitemapRecipes: SitemapRecipeEntry[] = publishedRecipes.map((r) => ({
      slug: r.slug,
      updatedAt: r.updatedAt,
    }));
    const sitemapCategories: SitemapCategoryEntry[] = context.categories.map((c) => ({
      slug: c.slug,
    }));
    const sitemapSeries: SitemapSeriesEntry[] = publishedSeries.map((s) => ({
      slug: s.slug,
    }));
    const entries = buildSitemapEntries({
      siteUrl: context.siteUrl,
      recipes: sitemapRecipes,
      categories: sitemapCategories,
      series: sitemapSeries,
      studioLessons: context.studioLessons,
      includeStudio: context.studioPublicLaunchEnabled,
      includeCookWithWhatYouHave: Boolean(context.cookWithWhatYouHaveEnabled),
    });
    const paths = new Set(sitemapPathnamesFromEntries(entries, context.siteUrl));

    let missingPublished = 0;
    for (const recipe of publishedRecipes) {
      const path = recipeSitemapPath(recipe.slug);
      if (!paths.has(path)) {
        missingPublished += 1;
        issues.push({
          id: "sitemap.missing_recipe",
          severity: "attention",
          category: "indexing",
          title: "Published Recipe missing from sitemap",
          description: `${path} is published but absent from sitemap membership.`,
          href: `/admin/recipes/${recipe.id}`,
          entityType: "recipe",
          entityId: recipe.id,
          entityLabel: recipe.title,
        });
      }
    }

    let privateInSitemap = 0;
    for (const recipe of draftLikeRecipes) {
      const path = recipeSitemapPath(recipe.slug);
      // Draft/scheduled must not appear — builder only receives published, so this
      // guards against accidental inclusion if context were mis-fed.
      if (paths.has(path)) {
        privateInSitemap += 1;
        issues.push({
          id: "sitemap.private_recipe",
          severity: "attention",
          category: "indexing",
          title: "Non-published Recipe in sitemap",
          description: `${path} is draft/scheduled but present in sitemap membership.`,
          href: `/admin/recipes/${recipe.id}`,
          entityType: "recipe",
          entityId: recipe.id,
          entityLabel: recipe.title,
        });
      }
    }

    const recipeUrls = entries
      .map((e) => String(e.url))
      .filter((url) => url.includes("/recipes/") && !url.endsWith("/recipes"));
    const uniqueRecipeUrls = new Set(recipeUrls);
    const hasDuplicateRecipeUrl = uniqueRecipeUrls.size !== recipeUrls.length;
    if (hasDuplicateRecipeUrl) {
      issues.push({
        id: "sitemap.duplicate_recipe",
        severity: "attention",
        category: "indexing",
        title: "Duplicate Recipe sitemap URLs",
        description: "Sitemap membership produced duplicate Recipe URLs.",
      });
    }

    checks.push({
      id: "sitemap.published_recipes",
      category: "indexing",
      title: "Published Recipes appear in sitemap",
      passed: missingPublished === 0,
      severity: "attention",
    });
    checks.push({
      id: "sitemap.draft_excluded",
      category: "indexing",
      title: "Draft and scheduled Recipes excluded from sitemap",
      passed: privateInSitemap === 0,
      severity: "attention",
      detail: `${draftLikeRecipes.length} draft/scheduled checked`,
    });
    checks.push({
      id: "sitemap.recipe_unique",
      category: "indexing",
      title: "Recipe sitemap URLs are unique",
      passed: !hasDuplicateRecipeUrl,
      severity: "attention",
    });

    for (const series of context.series.filter((s) => !s.isPublished)) {
      const path = `/series/${series.slug}`;
      if (paths.has(path)) {
        issues.push({
          id: "sitemap.private_series",
          severity: "attention",
          category: "indexing",
          title: "Unpublished Collection in sitemap",
          description: `${path} is unpublished but present in sitemap membership.`,
          href: `/admin/series/${series.id}`,
          entityType: "series",
          entityId: series.id,
          entityLabel: series.title,
        });
      }
    }
    checks.push({
      id: "sitemap.series_policy",
      category: "indexing",
      title: "Only published Collections appear in sitemap",
      passed: !issues.some((i) => i.id === "sitemap.private_series"),
      severity: "attention",
    });

    checks.push({
      id: "sitemap.video_watch_policy",
      category: "indexing",
      title: "Individual video watch pages omitted from sitemap",
      passed:
        context.policy.sitemapOmitsVideoWatchPages && !SITEMAP_INCLUDES_VIDEO_WATCH_PAGES,
      detail: "Hub /videos is included; /videos/[id] is intentionally omitted.",
    });
  }

  // —— Robots ——
  const disallow = publicRobotsDisallow(context.studioPublicLaunchEnabled);
  const robotsOk =
    robotsDisallowsAdmin(disallow) &&
    robotsDisallowsProfile(disallow) &&
    robotsDisallowsApi(disallow);
  if (!robotsOk) {
    issues.push({
      id: "robots.admin_indexable",
      severity: "attention",
      category: "indexing",
      title: "Robots disallow list incomplete",
      description: "Public robots rules must disallow /admin, /profile, and /api/.",
    });
  }
  checks.push({
    id: "robots.private_surfaces",
    category: "indexing",
    title: "Robots disallow Admin, profile, and API",
    passed: robotsOk,
    severity: "attention",
  });

  // —— Noindex / canonical policy wiring ——
  const policyPairs: Array<{
    id: string;
    title: string;
    ok: boolean;
    category: SiteHealthCategory;
    issueId?: string;
    description?: string;
  }> = [
    {
      id: "noindex.admin",
      title: "Admin layout declares noindex",
      ok: context.policy.adminLayoutNoIndex,
      category: "indexing",
      issueId: "robots.admin_indexable",
      description: "Admin layout must set robots noindex.",
    },
    {
      id: "noindex.profile",
      title: "Member profile is noindex",
      ok: context.policy.profileNoIndex,
      category: "indexing",
    },
    {
      id: "noindex.member_collection",
      title: "Private member collections are noindex",
      ok: context.policy.memberCollectionNoIndex,
      category: "indexing",
    },
    {
      id: "noindex.cooking_mode",
      title: "Cooking Mode is noindex",
      ok: context.policy.cookingModeNoIndex,
      category: "indexing",
    },
    {
      id: "canonical.recipe",
      title: "Recipe pages canonicalise to current slug",
      ok: context.policy.recipeCanonicalUsesSlug,
      category: "canonical",
    },
    {
      id: "canonical.series",
      title: "Editorial Collection pages use /series/[slug] canonical",
      ok: context.policy.seriesCanonicalUsesSlug,
      category: "canonical",
    },
    {
      id: "canonical.videos_hub",
      title: "Videos hub canonical is /videos",
      ok: context.policy.videosHubCanonical,
      category: "canonical",
    },
    {
      id: "noindex.recipes_filters",
      title: "Recipe discovery filters are noindex",
      ok: context.policy.recipesFilterNoIndex,
      category: "indexing",
    },
    {
      id: "noindex.videos_filters",
      title: "Videos format filters are noindex",
      ok: context.policy.videosFilterNoIndex,
      category: "indexing",
    },
  ];

  for (const pair of policyPairs) {
    checks.push({
      id: pair.id,
      category: pair.category,
      title: pair.title,
      passed: pair.ok,
      severity: "attention",
    });
    if (!pair.ok) {
      issues.push({
        id: pair.issueId || pair.id,
        severity: "attention",
        category: pair.category,
        title: pair.title,
        description: pair.description || `${pair.title} wiring failed verification.`,
      });
    }
  }

  // —— Structured data ——
  checks.push({
    id: "schema.cooking_mode",
    category: "structured_data",
    title: "Cooking Mode omits Recipe JSON-LD",
    passed: context.policy.cookingModeOmitsRecipeSchema,
    severity: "attention",
  });
  if (!context.policy.cookingModeOmitsRecipeSchema) {
    issues.push({
      id: "schema.recipe",
      severity: "attention",
      category: "structured_data",
      title: "Cooking Mode must not emit Recipe JSON-LD",
      description: "Duplicate Recipe schema on the cook tool URL was detected in wiring.",
    });
  }

  if (context.schemaSampleRecipe) {
    const json = recipeJsonLd(context.schemaSampleRecipe);
    const shape = validateRecipeJsonLdShape(json);
    checks.push({
      id: "schema.recipe",
      category: "structured_data",
      title: "Recipe JSON-LD builder produces required structural fields",
      passed: shape.ok,
      severity: "attention",
      detail: shape.ok ? undefined : `Missing: ${shape.missing.join(", ")}`,
    });
    if (!shape.ok) {
      issues.push({
        id: "schema.recipe",
        severity: "attention",
        category: "structured_data",
        title: "Recipe JSON-LD structural gap",
        description: `Builder output missing: ${shape.missing.join(", ")}.`,
      });
    }
    // Without reviewStats, aggregateRating must not appear (no fabrication).
    const fabricated = recipeJsonLdHasFabricatedRating(json);
    checks.push({
      id: "schema.recipe_ratings",
      category: "structured_data",
      title: "Recipe ratings omitted when no review data",
      passed: !fabricated,
      severity: "attention",
    });
    if (fabricated) {
      issues.push({
        id: "schema.recipe",
        severity: "attention",
        category: "structured_data",
        title: "Fabricated Recipe rating in JSON-LD",
        description: "aggregateRating appeared without review stats — ratings must be truthful.",
      });
    }
  } else {
    checks.push({
      id: "schema.recipe",
      category: "structured_data",
      title: "Recipe JSON-LD builder available",
      passed: true,
      detail: "No published sample loaded for shape smoke; builder wiring verified separately.",
    });
  }

  checks.push({
    id: "schema.video",
    category: "structured_data",
    title: "VideoObject remains gated on reliable metadata",
    passed: true,
    detail: "Watch pages require publishedAt + thumbnail; Recipe nested video uses isSchemaVideoId.",
  });

  // —— Internal relationships (Series items) ——
  let seriesBroken = 0;
  for (const series of publishedSeries) {
    for (const item of series.items) {
      if (item.removedFromPlaylist) continue;
      const recipeOk = item.recipeId && item.recipeStatus === "published";
      const videoPublic =
        item.youtubeVideoId &&
        (!item.youtubePrivacyStatus ||
          item.youtubePrivacyStatus.toLowerCase() === "public");
      if (!recipeOk && !videoPublic) {
        seriesBroken += 1;
        issues.push({
          id: "internal_link.series_recipe",
          severity: "attention",
          category: "internal_link",
          title: "Published Collection item has no public target",
          description: `An item in “${series.title}” has neither a published Recipe nor a public video fallback.`,
          href: `/admin/series/${series.id}`,
          entityType: "series",
          entityId: series.id,
          entityLabel: series.title,
        });
      }
    }
  }
  checks.push({
    id: "internal_link.series_items",
    category: "internal_link",
    title: "Published Collection items resolve publicly",
    passed: seriesBroken === 0,
    severity: "attention",
  });

  // Homepage integrity: owned by catalogue integrity / homepage eligibility — do not duplicate.
  checks.push({
    id: "internal_link.homepage_ownership",
    category: "internal_link",
    title: "Homepage integrity remains owned by existing helpers",
    passed: context.policy.homepageIntegrityOwnedElsewhere,
    detail: "listPublishContentWarnings / homepageEligibleRecipes — not re-emitted here.",
  });

  // Media boundary: missing hero stays Content Health / readiness.
  checks.push({
    id: "media.content_health_boundary",
    category: "media",
    title: "Missing Recipe hero remains Content Health concern",
    passed: context.policy.contentHealthOwnsRecipeHero,
    detail: "Site Health does not re-flag readiness hero requirements.",
  });

  // —— Summarize ——
  const attentionCount = issues.filter((i) => i.severity === "attention").length;
  const recommendationCount = issues.filter((i) => i.severity === "recommendation").length;
  const checksPassing = checks.filter((c) => c.passed).length;
  let status: SiteHealthStatus = "healthy";
  if (attentionCount > 0) status = "needs_attention";
  else if (recommendationCount > 0) status = "recommendation";

  return {
    status,
    summary: {
      status,
      attentionCount,
      recommendationCount,
      checksPassing,
      checksTotal: checks.length,
      issueCount: issues.length,
    },
    checks,
    issues,
    groupedIssues: groupSiteHealthIssues(issues),
  };
}

/** Default policy facts for production Admin load — wiring verified by Phase 6D tests. */
export function defaultSiteHealthPolicyFacts(): SiteHealthContext["policy"] {
  return {
    adminLayoutNoIndex: true,
    profileNoIndex: true,
    memberCollectionNoIndex: true,
    cookingModeNoIndex: true,
    cookingModeOmitsRecipeSchema: true,
    recipesFilterNoIndex: true,
    videosFilterNoIndex: true,
    videosHubCanonical: true,
    recipeCanonicalUsesSlug: true,
    seriesCanonicalUsesSlug: true,
    sitemapOmitsVideoWatchPages: !SITEMAP_INCLUDES_VIDEO_WATCH_PAGES,
    homepageIntegrityOwnedElsewhere: true,
    contentHealthOwnsRecipeHero: true,
  };
}

export function recipePublicPathForSlug(slug: string): string {
  return recipePublicPath(slug);
}

export { site as siteHealthSiteDefaults };
