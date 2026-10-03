/**
 * Roadmap #13 — Admin Growth Opportunities (Phase 13B).
 *
 * Pure deterministic domain + rule engine.
 * Computed / read-only model: no persistence, no dismissal, no global Growth Score,
 * no DB/network/env, no AI, no automatic content changes.
 *
 * 13C adds server aggregate loaders; 13D adds /admin/growth + feature gate.
 */

import { CATEGORY_INDEXABLE_MIN_RECIPES } from "@/lib/category-seo";
import { INGREDIENT_INDEXABLE_MIN_RECIPES } from "@/lib/ingredient-seo";
import { isFollowableCategoryGroup } from "@/lib/member-follows";

// ─── Taxonomy ───────────────────────────────────────────────────────────────

export const GROWTH_OPPORTUNITY_TYPES = [
  "search_demand",
  "seo_coverage",
  "internal_linking",
  "video",
  "content_quality",
  "series_depth",
] as const;

export type GrowthOpportunityType = (typeof GROWTH_OPPORTUNITY_TYPES)[number];

export const GROWTH_OPPORTUNITY_TYPE_LABELS: Record<GrowthOpportunityType, string> = {
  search_demand: "Search Demand",
  seo_coverage: "SEO / Coverage",
  internal_linking: "Internal Linking",
  video: "Video",
  content_quality: "Content Quality",
  series_depth: "Series Depth",
};

export const GROWTH_OPPORTUNITY_PRIORITIES = ["high", "medium", "low"] as const;
export type GrowthOpportunityPriority = (typeof GROWTH_OPPORTUNITY_PRIORITIES)[number];

export const GROWTH_OPPORTUNITY_ENTITY_TYPES = [
  "recipe",
  "category",
  "ingredient",
  "series",
  "search_query",
] as const;

export type GrowthOpportunityEntityType = (typeof GROWTH_OPPORTUNITY_ENTITY_TYPES)[number];

export const GROWTH_OPPORTUNITY_RULE_IDS = [
  "search_zero_repeat",
  "category_below_indexable",
  "category_empty_indexable_description",
  "ingredient_near_indexable",
  "recipe_zero_contextual_links",
  "recipe_missing_youtube",
  "recipe_youtube_missing_timestamps",
  "series_thin_published",
  "published_readiness_recommendations",
] as const;

export type GrowthOpportunityRuleId = (typeof GROWTH_OPPORTUNITY_RULE_IDS)[number];

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Verified — shared with Category SEO. */
export { CATEGORY_INDEXABLE_MIN_RECIPES };

/** Verified — shared with Ingredient SEO. */
export { INGREDIENT_INDEXABLE_MIN_RECIPES };

/** Verified — indexable minimum − 1. */
export const GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT = INGREDIENT_INDEXABLE_MIN_RECIPES - 1;

/**
 * Provisional — zero-result search minimum to surface (13A; volume TBD in 13C).
 */
export const GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT = 3;

/**
 * Provisional — zero-result search High priority band.
 */
export const GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT = 10;

/**
 * Provisional — default SearchEvent window for Growth (matches Search Admin default).
 */
export const GROWTH_SEARCH_WINDOW_DAYS = 28;

/**
 * Provisional — published Series with this many Published Recipe members or fewer.
 */
export const GROWTH_THIN_SERIES_MAX_PUBLISHED_RECIPES = 1;

/** Max readiness recommendation lines shown in evidence before a summary. */
export const GROWTH_READINESS_EVIDENCE_CAP = 3;

// ─── Domain type ────────────────────────────────────────────────────────────

/**
 * Serializable Growth opportunity. No PII, no callbacks, no DB rows.
 * `evidenceStrength` is a sorting helper only (e.g. search counts) — not a Growth Score.
 */
export type GrowthOpportunity = {
  id: string;
  ruleId: GrowthOpportunityRuleId;
  type: GrowthOpportunityType;
  priority: GrowthOpportunityPriority;
  title: string;
  evidence: string[];
  /** Explainable priority band reason (not a numeric score). */
  priorityReason: string;
  actionLabel: string;
  href: string;
  entityType: GrowthOpportunityEntityType;
  entityId: string;
  windowDays?: number;
  /** Deterministic sort helper for count-backed rules only. Never a global score. */
  evidenceStrength?: number;
};

export type GrowthReadinessRecommendation = {
  id: string;
  label: string;
};

/** Aggregate search gap — never includes visitor/user identity. */
export type GrowthSearchAggregate = {
  queryNorm: string;
  displayQuery: string;
  zeroResultCount: number;
  windowDays: number;
};

export type GrowthCategoryAggregate = {
  id: string;
  slug: string;
  name: string;
  group: string;
  description: string;
  publishedRecipeCount: number;
};

export type GrowthIngredientAggregate = {
  id: string;
  slug: string;
  name: string;
  /** Distinct Published Recipe count. */
  publishedRecipeCount: number;
};

export type GrowthRecipeAggregate = {
  id: string;
  title: string;
  isPublished: boolean;
  contextualLinkCount: number;
  /** Optional 13C enrichment from #11 — never scores. */
  hasContextualSuggestion?: boolean;
  hasUsableYouTube: boolean;
  stepTimestampCount: number;
  /** Recommended failures only — never required/blocking checks. */
  failedRecommendedChecks: GrowthReadinessRecommendation[];
};

export type GrowthSeriesAggregate = {
  id: string;
  name: string;
  isPublished: boolean;
  publishedRecipeMemberCount: number;
};

export type GrowthOpportunitiesInput = {
  searches?: readonly GrowthSearchAggregate[];
  categories?: readonly GrowthCategoryAggregate[];
  ingredients?: readonly GrowthIngredientAggregate[];
  recipes?: readonly GrowthRecipeAggregate[];
  series?: readonly GrowthSeriesAggregate[];
};

// ─── Identity / sort / dedupe ───────────────────────────────────────────────

const PRIORITY_RANK: Record<GrowthOpportunityPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildGrowthOpportunityId(
  ruleId: GrowthOpportunityRuleId,
  entityType: GrowthOpportunityEntityType,
  stableEntityKey: string,
): string {
  const key = String(stableEntityKey || "").trim();
  return `${ruleId}:${entityType}:${key}`;
}

export function dedupeGrowthOpportunities(
  opportunities: readonly GrowthOpportunity[],
): GrowthOpportunity[] {
  const byId = new Map<string, GrowthOpportunity>();
  for (const opportunity of opportunities) {
    const existing = byId.get(opportunity.id);
    if (!existing) {
      byId.set(opportunity.id, opportunity);
      continue;
    }
    // Deterministic: keep stronger priority, then higher evidenceStrength, then first.
    if (PRIORITY_RANK[opportunity.priority] < PRIORITY_RANK[existing.priority]) {
      byId.set(opportunity.id, opportunity);
      continue;
    }
    if (
      PRIORITY_RANK[opportunity.priority] === PRIORITY_RANK[existing.priority] &&
      (opportunity.evidenceStrength ?? 0) > (existing.evidenceStrength ?? 0)
    ) {
      byId.set(opportunity.id, opportunity);
    }
  }
  return [...byId.values()];
}

export function compareGrowthOpportunities(a: GrowthOpportunity, b: GrowthOpportunity): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  const strengthA = a.evidenceStrength ?? 0;
  const strengthB = b.evidenceStrength ?? 0;
  if (strengthA !== strengthB) return strengthB - strengthA;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.id.localeCompare(b.id);
}

export function sortGrowthOpportunities(
  opportunities: readonly GrowthOpportunity[],
): GrowthOpportunity[] {
  return [...opportunities].sort(compareGrowthOpportunities);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function quoteQuery(display: string): string {
  return `'${display.replace(/'/g, "’")}'`;
}

function displaySearchQuery(row: GrowthSearchAggregate): string {
  const display = String(row.displayQuery || "").trim();
  if (display) return display;
  return String(row.queryNorm || "").trim();
}

function categoryAdminHref(): string {
  return "/admin/categories";
}

function ingredientAdminHref(): string {
  return "/admin/ingredients";
}

function recipeAdminHref(id: string): string {
  return `/admin/recipes/${encodeURIComponent(id)}`;
}

function seriesAdminHref(id: string): string {
  return `/admin/series/${encodeURIComponent(id)}`;
}

function searchAdminHref(): string {
  // Search Admin supports `range` only — no query filter param.
  return "/admin/search";
}

// ─── Rules ──────────────────────────────────────────────────────────────────

/** R1 — repeated zero-result searches (aggregate input only). */
export function getSearchZeroRepeatOpportunity(
  row: GrowthSearchAggregate,
): GrowthOpportunity | null {
  const queryNorm = String(row.queryNorm || "").trim();
  if (!queryNorm) return null;
  if (row.windowDays !== GROWTH_SEARCH_WINDOW_DAYS) return null;
  const count = Number(row.zeroResultCount);
  if (!Number.isFinite(count) || count < GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT) return null;

  const display = displaySearchQuery(row);
  const priority: GrowthOpportunityPriority =
    count >= GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT ? "high" : "medium";
  const priorityReason =
    priority === "high"
      ? `Zero-result count ${count} meets the high band (≥${GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT}).`
      : `Zero-result count ${count} meets the medium band (≥${GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT}).`;

  return {
    id: buildGrowthOpportunityId("search_zero_repeat", "search_query", queryNorm),
    ruleId: "search_zero_repeat",
    type: "search_demand",
    priority,
    priorityReason,
    title: `Review zero-result search ${quoteQuery(display)}`,
    evidence: [
      `${quoteQuery(display)} returned zero Recipes ${count} times in the last ${GROWTH_SEARCH_WINDOW_DAYS} days.`,
    ],
    actionLabel: "Review search coverage",
    href: searchAdminHref(),
    entityType: "search_query",
    entityId: queryNorm,
    windowDays: GROWTH_SEARCH_WINDOW_DAYS,
    evidenceStrength: count,
  };
}

/** R2 — category below indexability threshold (includes 0). */
export function getCategoryBelowIndexableOpportunity(
  row: GrowthCategoryAggregate,
): GrowthOpportunity | null {
  const slug = String(row.slug || "").trim();
  if (!slug) return null;
  const count = Number(row.publishedRecipeCount);
  if (!Number.isFinite(count) || count < 0) return null;
  if (count >= CATEGORY_INDEXABLE_MIN_RECIPES) return null;

  const name = String(row.name || "").trim() || slug;
  const followable = isFollowableCategoryGroup(row.group);
  let priority: GrowthOpportunityPriority;
  let priorityReason: string;
  let actionLabel: string;
  let evidence: string[];

  if (count === 0) {
    priority = "medium";
    priorityReason = "Category has no Published Recipes (coverage gap; not near-indexable).";
    actionLabel = "Open category";
    evidence = [
      `${name} has no Published Recipes.`,
      `Category pages become indexable at ${CATEGORY_INDEXABLE_MIN_RECIPES} Published Recipes.`,
      "Add relevant Recipes or review whether this category should remain public.",
    ];
  } else {
    priority = followable ? "high" : "medium";
    priorityReason = followable
      ? `Followable group (${String(row.group).trim()}) with ${count} Published Recipe(s) below indexability.`
      : `${count} Published Recipe(s) below indexability in a non-followable group.`;
    actionLabel = "Open category";
    evidence = [
      `${name} has ${count} Published Recipe${count === 1 ? "" : "s"}; category pages become indexable at ${CATEGORY_INDEXABLE_MIN_RECIPES}.`,
      "Add another relevant Published Recipe or review category memberships.",
    ];
  }

  return {
    id: buildGrowthOpportunityId("category_below_indexable", "category", slug),
    ruleId: "category_below_indexable",
    type: "seo_coverage",
    priority,
    priorityReason,
    title: `Improve ${name} coverage`,
    evidence,
    actionLabel,
    href: categoryAdminHref(),
    entityType: "category",
    entityId: slug,
  };
}

/** R3 — indexable category with empty description. */
export function getCategoryEmptyIndexableDescriptionOpportunity(
  row: GrowthCategoryAggregate,
): GrowthOpportunity | null {
  const slug = String(row.slug || "").trim();
  if (!slug) return null;
  const count = Number(row.publishedRecipeCount);
  if (!Number.isFinite(count) || count < CATEGORY_INDEXABLE_MIN_RECIPES) return null;
  if (String(row.description || "").trim()) return null;

  const name = String(row.name || "").trim() || slug;
  return {
    id: buildGrowthOpportunityId("category_empty_indexable_description", "category", slug),
    ruleId: "category_empty_indexable_description",
    type: "seo_coverage",
    priority: "low",
    priorityReason: "Indexable category missing description — editorial polish, not a blocking gap.",
    title: `Add description for ${name}`,
    evidence: [
      `Category has ${count} Published Recipes and is indexable, but has no description.`,
    ],
    actionLabel: "Open category",
    href: categoryAdminHref(),
    entityType: "category",
    entityId: slug,
  };
}

/** R4 — ingredient exactly one below indexable density. */
export function getIngredientNearIndexableOpportunity(
  row: GrowthIngredientAggregate,
): GrowthOpportunity | null {
  const slug = String(row.slug || "").trim();
  if (!slug) return null;
  const count = Number(row.publishedRecipeCount);
  if (!Number.isFinite(count) || count !== GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT) return null;

  const name = String(row.name || "").trim() || slug;
  return {
    id: buildGrowthOpportunityId("ingredient_near_indexable", "ingredient", slug),
    ruleId: "ingredient_near_indexable",
    type: "seo_coverage",
    priority: "medium",
    priorityReason: `Exactly ${GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT} Published Recipes — one below the indexable threshold.`,
    title: `Strengthen ${name} ingredient coverage`,
    evidence: [
      `Appears in ${count} Published Recipes; ingredient pages become indexable at ${INGREDIENT_INDEXABLE_MIN_RECIPES}.`,
      "Review whether another appropriate Recipe can strengthen this ingredient cluster — do not add the ingredient to unrelated Recipes.",
    ],
    actionLabel: "Open ingredient",
    href: ingredientAdminHref(),
    entityType: "ingredient",
    entityId: slug,
  };
}

/** R5 — Published Recipe with zero accepted contextual links. */
export function getRecipeContextualLinkOpportunity(
  row: GrowthRecipeAggregate,
): GrowthOpportunity | null {
  if (!row.isPublished) return null;
  const id = String(row.id || "").trim();
  if (!id) return null;
  const linkCount = Number(row.contextualLinkCount);
  if (!Number.isFinite(linkCount) || linkCount !== 0) return null;

  const title = String(row.title || "").trim() || id;
  const hasSuggestion = row.hasContextualSuggestion === true;
  const priority: GrowthOpportunityPriority = hasSuggestion ? "high" : "medium";
  const evidence = ["Recipe currently has no accepted contextual internal links."];
  if (hasSuggestion) {
    evidence.push(
      "Existing internal-link recommendation logic found at least one eligible candidate.",
    );
  }

  return {
    id: buildGrowthOpportunityId("recipe_zero_contextual_links", "recipe", id),
    ruleId: "recipe_zero_contextual_links",
    type: "internal_linking",
    priority,
    priorityReason: hasSuggestion
      ? "No accepted links, and at least one deterministic recommendation exists."
      : "No accepted contextual internal links.",
    title: `Add contextual links on ${title}`,
    evidence,
    actionLabel: "Review internal links",
    href: recipeAdminHref(id),
    entityType: "recipe",
    entityId: id,
  };
}

/** R6 — Published Recipe missing usable YouTube (recommended, not required). */
export function getRecipeMissingYoutubeOpportunity(
  row: GrowthRecipeAggregate,
): GrowthOpportunity | null {
  if (!row.isPublished) return null;
  const id = String(row.id || "").trim();
  if (!id) return null;
  if (row.hasUsableYouTube) return null;

  const title = String(row.title || "").trim() || id;
  return {
    id: buildGrowthOpportunityId("recipe_missing_youtube", "recipe", id),
    ruleId: "recipe_missing_youtube",
    type: "video",
    priority: "medium",
    priorityReason: "Published Recipe without a linked YouTube video (recommended enhancement).",
    title: `Consider video for ${title}`,
    evidence: ["Published Recipe has no linked YouTube video."],
    actionLabel: "Open Recipe",
    href: recipeAdminHref(id),
    entityType: "recipe",
    entityId: id,
  };
}

/** R7 — Published Recipe has YouTube but no step timestamps. */
export function getRecipeYoutubeMissingTimestampsOpportunity(
  row: GrowthRecipeAggregate,
): GrowthOpportunity | null {
  if (!row.isPublished) return null;
  const id = String(row.id || "").trim();
  if (!id) return null;
  if (!row.hasUsableYouTube) return null;
  const timestamps = Number(row.stepTimestampCount);
  if (!Number.isFinite(timestamps) || timestamps > 0) return null;

  const title = String(row.title || "").trim() || id;
  return {
    id: buildGrowthOpportunityId("recipe_youtube_missing_timestamps", "recipe", id),
    ruleId: "recipe_youtube_missing_timestamps",
    type: "video",
    priority: "high",
    priorityReason: "Linked video without step timestamps — clear enhancement path (#10).",
    title: `Add timestamps for ${title}`,
    evidence: ["Recipe has a linked YouTube video but no step timestamps."],
    actionLabel: "Open Recipe",
    href: recipeAdminHref(id),
    entityType: "recipe",
    entityId: id,
  };
}

/**
 * R8 — thin published Series (≤ GROWTH_THIN_SERIES_MAX_PUBLISHED_RECIPES).
 * Priority locked to medium in 13B (no public-visibility enrichment yet).
 */
export function getSeriesThinPublishedOpportunity(
  row: GrowthSeriesAggregate,
): GrowthOpportunity | null {
  if (!row.isPublished) return null;
  const id = String(row.id || "").trim();
  if (!id) return null;
  const count = Number(row.publishedRecipeMemberCount);
  if (!Number.isFinite(count) || count < 0) return null;
  if (count > GROWTH_THIN_SERIES_MAX_PUBLISHED_RECIPES) return null;

  const name = String(row.name || "").trim() || id;
  const evidence =
    count === 0
      ? [
          `${name} is published and has no Published Recipe members.`,
          "Add relevant Recipes or review whether Series should remain published.",
        ]
      : [
          `${name} is published and has ${count} Published Recipe member.`,
          "Add relevant Recipes or review whether Series should remain published.",
        ];

  return {
    id: buildGrowthOpportunityId("series_thin_published", "series", id),
    ruleId: "series_thin_published",
    type: "series_depth",
    priority: "medium",
    priorityReason:
      "Published Series with thin Recipe membership (13B: medium until public-visibility enrichment).",
    title: `Review Series depth for ${name}`,
    evidence,
    actionLabel: "Review Series",
    href: seriesAdminHref(id),
    entityType: "series",
    entityId: id,
  };
}

/** R9 — Published Recipe with recommended readiness gaps only. */
export function getRecipeReadinessOpportunity(
  row: GrowthRecipeAggregate,
): GrowthOpportunity | null {
  if (!row.isPublished) return null;
  const id = String(row.id || "").trim();
  if (!id) return null;
  const checks = Array.isArray(row.failedRecommendedChecks)
    ? row.failedRecommendedChecks.filter((check) => String(check?.id || "").trim())
    : [];
  if (checks.length === 0) return null;

  const title = String(row.title || "").trim() || id;
  const evidence: string[] = [];
  const shown = checks.slice(0, GROWTH_READINESS_EVIDENCE_CAP);
  for (const check of shown) {
    const label = String(check.label || "").trim() || String(check.id).trim();
    evidence.push(`Recommended improvement: ${label}.`);
  }
  if (checks.length > GROWTH_READINESS_EVIDENCE_CAP) {
    evidence.push(
      `${checks.length - GROWTH_READINESS_EVIDENCE_CAP} more recommended improvement(s).`,
    );
  }

  return {
    id: buildGrowthOpportunityId("published_readiness_recommendations", "recipe", id),
    ruleId: "published_readiness_recommendations",
    type: "content_quality",
    priority: "medium",
    priorityReason: "Published Recipe has recommended (non-blocking) readiness improvements.",
    title: `Review recommendations for ${title}`,
    evidence,
    actionLabel: "Review recommendations",
    href: recipeAdminHref(id),
    entityType: "recipe",
    entityId: id,
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Pure orchestrator: apply all MVP rules → flatten → dedupe → sort.
 * No DB, cache, env, or feature gate.
 */
export function buildGrowthOpportunities(input: GrowthOpportunitiesInput): GrowthOpportunity[] {
  const collected: GrowthOpportunity[] = [];

  for (const row of input.searches ?? []) {
    const opportunity = getSearchZeroRepeatOpportunity(row);
    if (opportunity) collected.push(opportunity);
  }
  for (const row of input.categories ?? []) {
    const below = getCategoryBelowIndexableOpportunity(row);
    if (below) collected.push(below);
    const description = getCategoryEmptyIndexableDescriptionOpportunity(row);
    if (description) collected.push(description);
  }
  for (const row of input.ingredients ?? []) {
    const opportunity = getIngredientNearIndexableOpportunity(row);
    if (opportunity) collected.push(opportunity);
  }
  for (const row of input.recipes ?? []) {
    const links = getRecipeContextualLinkOpportunity(row);
    if (links) collected.push(links);
    const missingVideo = getRecipeMissingYoutubeOpportunity(row);
    if (missingVideo) collected.push(missingVideo);
    const timestamps = getRecipeYoutubeMissingTimestampsOpportunity(row);
    if (timestamps) collected.push(timestamps);
    const readiness = getRecipeReadinessOpportunity(row);
    if (readiness) collected.push(readiness);
  }
  for (const row of input.series ?? []) {
    const opportunity = getSeriesThinPublishedOpportunity(row);
    if (opportunity) collected.push(opportunity);
  }

  return sortGrowthOpportunities(dedupeGrowthOpportunities(collected));
}
