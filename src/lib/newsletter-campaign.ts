/**
 * Phase 12C — Newsletter campaign domain (pure).
 *
 * Persists editorial campaign content as Recipe IDs only.
 * Consent remains NewsletterSubscriber. No DB / Resend / env in this module.
 */

import {
  emptyNewsletterInterestProfile,
  selectNewsletterRecipeBlock,
  type NewsletterInterestProfile,
  type NewsletterRecipeBlockItem,
  type NewsletterRecipeBlockResult,
  type NewsletterRecipeCandidate,
  NEWSLETTER_RECIPE_BLOCK_HARD_MAX,
} from "@/lib/newsletter-personalization";
import { normalizeRecipePublicationStatus } from "@/lib/recipe-schedule";

export const NEWSLETTER_CAMPAIGN_STATUSES = ["draft", "sending", "sent"] as const;
export type NewsletterCampaignStatus = (typeof NEWSLETTER_CAMPAIGN_STATUSES)[number];

export const NEWSLETTER_CAMPAIGN_NAME_MAX = 120;
export const NEWSLETTER_CAMPAIGN_SUBJECT_MAX = 140;
export const NEWSLETTER_CAMPAIGN_PREHEADER_MAX = 200;
export const NEWSLETTER_CAMPAIGN_INTRO_MAX = 3000;
/** Editorial fallback / default Recipe IDs (aligned with block hard max). */
export const NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX = NEWSLETTER_RECIPE_BLOCK_HARD_MAX;
/** Editor-selected personalization pool hard max. */
export const NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX = 20;

export type NewsletterCampaignContent = {
  subject: string;
  preheader: string;
  intro: string;
  /** Optional fixed hero Recipe — excluded from personalized/fallback block. */
  featuredRecipeId: string | null;
  /** Ordered editorial fallback Recipe IDs. */
  defaultRecipeIds: string[];
  /**
   * Personalization pool Recipe IDs.
   * Always includes every defaultRecipeId after normalization.
   */
  candidateRecipeIds: string[];
};

export type NewsletterCampaignSendReadinessIssueCode =
  | "invalid_status"
  | "locked_status"
  | "missing_subject"
  | "subject_too_long"
  | "preheader_too_long"
  | "intro_too_long"
  | "missing_defaults"
  | "defaults_over_limit"
  | "candidates_over_limit"
  | "invalid_featured_recipe"
  | "draft_featured_recipe"
  | "missing_featured_recipe"
  | "invalid_default_recipe"
  | "draft_default_recipe"
  | "missing_default_recipe"
  | "invalid_candidate_recipe"
  | "draft_candidate_recipe"
  | "missing_candidate_recipe"
  | "duplicate_recipe"
  | "name_required"
  | "name_too_long";

export type NewsletterCampaignSendReadinessIssue = {
  code: NewsletterCampaignSendReadinessIssueCode;
  message: string;
  recipeId?: string;
};

export type NewsletterCampaignSendReadiness = {
  ready: boolean;
  issues: NewsletterCampaignSendReadinessIssue[];
};

/** Resolved Recipe row used by readiness / orchestration (IDs + scoring fields). */
export type ResolvedNewsletterCampaignRecipe = {
  id: string;
  status: string;
  slug: string;
  title: string;
  publishedAt: Date | string | null;
  seriesIds: string[];
  categoryIds: string[];
  /** Optional public absolute image URL; omitted when unsafe/missing. */
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export type NewsletterCampaignSelectionInput = {
  content: NewsletterCampaignContent;
  /** Map or list of resolved Recipes covering featured/defaults/candidates. */
  resolvedRecipes: ResolvedNewsletterCampaignRecipe[] | Map<string, ResolvedNewsletterCampaignRecipe>;
  profile?: NewsletterInterestProfile | null;
  /** When false, always use editorial fallback block (gate OFF). */
  personalizationEnabled?: boolean;
  limit?: number;
};

export type NewsletterCampaignSelectionResult = {
  featured: ResolvedNewsletterCampaignRecipe | null;
  block: NewsletterRecipeBlockResult;
  excludedRecipeIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function clipPlain(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

/** Preserve first occurrence order; drop blanks and later duplicates. */
export function dedupeNewsletterRecipeIdsPreserveOrder(ids: Iterable<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isNewsletterCampaignStatus(
  value: string | null | undefined,
): value is NewsletterCampaignStatus {
  return (NEWSLETTER_CAMPAIGN_STATUSES as readonly string[]).includes(String(value ?? ""));
}

export function normalizeNewsletterCampaignStatus(
  value: string | null | undefined,
): NewsletterCampaignStatus | "unknown" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (isNewsletterCampaignStatus(raw)) return raw;
  return "unknown";
}

export function isNewsletterCampaignEditable(status: string | null | undefined): boolean {
  return normalizeNewsletterCampaignStatus(status) === "draft";
}

/**
 * Draft-safe content normalizer.
 * Truncates/dedupes; does not require send-ready completeness.
 * Ensures every defaultRecipeId appears in candidateRecipeIds.
 */
export function normalizeNewsletterCampaignContent(raw: unknown): NewsletterCampaignContent {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const record = asRecord(parsed);

  const featuredRaw = String(record.featuredRecipeId ?? "").trim();
  const featuredRecipeId = featuredRaw || null;

  let defaultRecipeIds = dedupeNewsletterRecipeIdsPreserveOrder(
    Array.isArray(record.defaultRecipeIds) ? record.defaultRecipeIds : [],
  ).slice(0, NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX);

  let candidateRecipeIds = dedupeNewsletterRecipeIdsPreserveOrder(
    Array.isArray(record.candidateRecipeIds) ? record.candidateRecipeIds : [],
  );

  // Defaults participate in the same available Recipe set as the pool.
  for (const id of defaultRecipeIds) {
    if (!candidateRecipeIds.includes(id)) candidateRecipeIds.push(id);
  }
  candidateRecipeIds = candidateRecipeIds.slice(0, NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX);

  // If a default was truncated out of the candidate cap, drop it from defaults too.
  const candidateSet = new Set(candidateRecipeIds);
  defaultRecipeIds = defaultRecipeIds.filter((id) => candidateSet.has(id));

  return {
    subject: clipPlain(record.subject, NEWSLETTER_CAMPAIGN_SUBJECT_MAX),
    preheader: clipPlain(record.preheader, NEWSLETTER_CAMPAIGN_PREHEADER_MAX),
    intro: clipPlain(record.intro, NEWSLETTER_CAMPAIGN_INTRO_MAX),
    featuredRecipeId,
    defaultRecipeIds,
    candidateRecipeIds,
  };
}

export function serializeNewsletterCampaignContent(content: NewsletterCampaignContent): string {
  const normalized = normalizeNewsletterCampaignContent(content);
  return JSON.stringify({
    subject: normalized.subject,
    preheader: normalized.preheader,
    intro: normalized.intro,
    featuredRecipeId: normalized.featuredRecipeId,
    defaultRecipeIds: normalized.defaultRecipeIds,
    candidateRecipeIds: normalized.candidateRecipeIds,
  });
}

function toResolvedMap(
  resolved: ResolvedNewsletterCampaignRecipe[] | Map<string, ResolvedNewsletterCampaignRecipe>,
): Map<string, ResolvedNewsletterCampaignRecipe> {
  if (resolved instanceof Map) return resolved;
  const map = new Map<string, ResolvedNewsletterCampaignRecipe>();
  for (const row of resolved) {
    const id = String(row?.id ?? "").trim();
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}

function recipeIssue(
  code: NewsletterCampaignSendReadinessIssueCode,
  message: string,
  recipeId?: string,
): NewsletterCampaignSendReadinessIssue {
  return recipeId ? { code, message, recipeId } : { code, message };
}

/**
 * Strict send-readiness. Independent of NEWSLETTER_PERSONALIZATION_ENABLED.
 * Does not mutate campaign content.
 */
export function getNewsletterCampaignSendReadiness(input: {
  name?: string | null;
  status: string | null | undefined;
  content: unknown;
  resolvedRecipes: ResolvedNewsletterCampaignRecipe[] | Map<string, ResolvedNewsletterCampaignRecipe>;
}): NewsletterCampaignSendReadiness {
  const issues: NewsletterCampaignSendReadinessIssue[] = [];
  const status = normalizeNewsletterCampaignStatus(input.status);
  if (status === "unknown") {
    issues.push({
      code: "invalid_status",
      message: "Campaign status is invalid.",
    });
  } else if (status === "sending" || status === "sent") {
    issues.push({
      code: "locked_status",
      message: "Campaign is locked and cannot be sent again from this state.",
    });
  }

  const name = String(input.name ?? "").trim();
  if (!name) {
    issues.push({ code: "name_required", message: "Campaign name is required." });
  } else if (name.length > NEWSLETTER_CAMPAIGN_NAME_MAX) {
    issues.push({
      code: "name_too_long",
      message: `Campaign name must be at most ${NEWSLETTER_CAMPAIGN_NAME_MAX} characters.`,
    });
  }

  // Readiness uses normalized content but also detects pre-normalization oversize
  // for subject/preheader/intro when raw strings exceed limits before clip.
  const rawRecord = (() => {
    let parsed: unknown = input.content;
    if (typeof input.content === "string") {
      try {
        parsed = JSON.parse(input.content);
      } catch {
        parsed = {};
      }
    }
    return asRecord(parsed);
  })();

  const rawSubject = String(rawRecord.subject ?? "").trim();
  if (!rawSubject) {
    issues.push({ code: "missing_subject", message: "Email subject is required." });
  } else if (rawSubject.length > NEWSLETTER_CAMPAIGN_SUBJECT_MAX) {
    issues.push({
      code: "subject_too_long",
      message: `Subject must be at most ${NEWSLETTER_CAMPAIGN_SUBJECT_MAX} characters.`,
    });
  }

  const rawPreheader = String(rawRecord.preheader ?? "").trim();
  if (rawPreheader.length > NEWSLETTER_CAMPAIGN_PREHEADER_MAX) {
    issues.push({
      code: "preheader_too_long",
      message: `Preheader must be at most ${NEWSLETTER_CAMPAIGN_PREHEADER_MAX} characters.`,
    });
  }

  const rawIntro = String(rawRecord.intro ?? "").trim();
  if (rawIntro.length > NEWSLETTER_CAMPAIGN_INTRO_MAX) {
    issues.push({
      code: "intro_too_long",
      message: `Intro must be at most ${NEWSLETTER_CAMPAIGN_INTRO_MAX} characters.`,
    });
  }

  const content = normalizeNewsletterCampaignContent(input.content);
  const resolved = toResolvedMap(input.resolvedRecipes);

  const rawDefaults = Array.isArray(rawRecord.defaultRecipeIds) ? rawRecord.defaultRecipeIds : [];
  const rawCandidates = Array.isArray(rawRecord.candidateRecipeIds)
    ? rawRecord.candidateRecipeIds
    : [];
  const rawDefaultIds = rawDefaults.map((id) => String(id ?? "").trim()).filter(Boolean);
  const rawCandidateIds = rawCandidates.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (rawDefaultIds.length !== new Set(rawDefaultIds).size) {
    issues.push({
      code: "duplicate_recipe",
      message: "Default Recipe list contains duplicates.",
    });
  }
  if (rawCandidateIds.length !== new Set(rawCandidateIds).size) {
    issues.push({
      code: "duplicate_recipe",
      message: "Candidate Recipe list contains duplicates.",
    });
  }
  if (
    dedupeNewsletterRecipeIdsPreserveOrder(rawDefaults).length >
    NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX
  ) {
    issues.push({
      code: "defaults_over_limit",
      message: `At most ${NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX} default Recipes are allowed.`,
    });
  }
  if (
    dedupeNewsletterRecipeIdsPreserveOrder([
      ...rawCandidates,
      ...rawDefaults,
    ]).length > NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX
  ) {
    issues.push({
      code: "candidates_over_limit",
      message: `At most ${NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX} candidate Recipes are allowed.`,
    });
  }

  if (content.defaultRecipeIds.length === 0) {
    issues.push({
      code: "missing_defaults",
      message: "At least one Published default Recipe is required.",
    });
  }

  function checkTarget(
    recipeId: string,
    role: "featured" | "default" | "candidate",
  ) {
    const row = resolved.get(recipeId);
    if (!row) {
      const code =
        role === "featured"
          ? "missing_featured_recipe"
          : role === "default"
            ? "missing_default_recipe"
            : "missing_candidate_recipe";
      issues.push(
        recipeIssue(code, `Recipe ${recipeId} could not be resolved.`, recipeId),
      );
      return;
    }
    const publication = normalizeRecipePublicationStatus(row.status);
    if (publication !== "published") {
      const code =
        role === "featured"
          ? "draft_featured_recipe"
          : role === "default"
            ? "draft_default_recipe"
            : "draft_candidate_recipe";
      issues.push(
        recipeIssue(code, `Recipe ${recipeId} must be Published to send.`, recipeId),
      );
      return;
    }
    if (!String(row.slug ?? "").trim()) {
      const code =
        role === "featured"
          ? "invalid_featured_recipe"
          : role === "default"
            ? "invalid_default_recipe"
            : "invalid_candidate_recipe";
      issues.push(
        recipeIssue(code, `Recipe ${recipeId} is missing a public slug.`, recipeId),
      );
    }
  }

  if (content.featuredRecipeId) {
    checkTarget(content.featuredRecipeId, "featured");
  }
  for (const id of content.defaultRecipeIds) checkTarget(id, "default");
  for (const id of content.candidateRecipeIds) {
    // Defaults already checked; still validate remaining pool members.
    if (content.defaultRecipeIds.includes(id)) continue;
    if (content.featuredRecipeId === id) continue;
    checkTarget(id, "candidate");
  }

  return { ready: issues.length === 0, issues };
}

function toScorerCandidate(row: ResolvedNewsletterCampaignRecipe): NewsletterRecipeCandidate {
  return {
    id: row.id,
    title: row.title,
    publishedAt: row.publishedAt,
    status: row.status,
    seriesIds: row.seriesIds ?? [],
    categoryIds: row.categoryIds ?? [],
  };
}

/**
 * Pure campaign Recipe-block orchestration.
 * Gate OFF → editorial fallback only. Featured ID is always excluded from the block.
 */
export function selectNewsletterCampaignRecipeSelection(
  input: NewsletterCampaignSelectionInput,
): NewsletterCampaignSelectionResult {
  const content = normalizeNewsletterCampaignContent(input.content);
  const resolved = toResolvedMap(input.resolvedRecipes);
  const featuredRaw = content.featuredRecipeId
    ? resolved.get(content.featuredRecipeId) ?? null
    : null;
  const featured = resolvePublishedFeaturedRecipe(featuredRaw);

  const excludedRecipeIds = content.featuredRecipeId ? [content.featuredRecipeId] : [];
  const candidates = content.candidateRecipeIds
    .map((id) => resolved.get(id))
    .filter((row): row is ResolvedNewsletterCampaignRecipe => Boolean(row))
    .map(toScorerCandidate);

  const personalizationEnabled = Boolean(input.personalizationEnabled);
  const profile = personalizationEnabled
    ? input.profile ?? emptyNewsletterInterestProfile(null)
    : emptyNewsletterInterestProfile(input.profile?.userId ?? null);

  const block = selectNewsletterRecipeBlock({
    profile,
    candidates,
    fallbackRecipeIds: content.defaultRecipeIds,
    excludedRecipeIds,
    limit: input.limit,
  });

  return {
    featured,
    block,
    excludedRecipeIds,
  };
}

/** Convenience: strip unpublished featured for send/preview rendering. */
export function resolvePublishedFeaturedRecipe(
  featured: ResolvedNewsletterCampaignRecipe | null | undefined,
): ResolvedNewsletterCampaignRecipe | null {
  if (!featured) return null;
  if (normalizeRecipePublicationStatus(featured.status) !== "published") return null;
  return featured;
}

export type NewsletterCampaignEmailRecipeCard = {
  id: string;
  title: string;
  href: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export function buildNewsletterCampaignEmailRecipeCards(input: {
  baseUrl: string;
  recipes: ResolvedNewsletterCampaignRecipe[];
}): NewsletterCampaignEmailRecipeCard[] {
  const base = String(input.baseUrl || "").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) return [];

  const cards: NewsletterCampaignEmailRecipeCard[] = [];
  for (const recipe of input.recipes) {
    if (normalizeRecipePublicationStatus(recipe.status) !== "published") continue;
    const slug = String(recipe.slug ?? "").trim();
    if (!slug || slug.includes("://") || slug.includes("..")) continue;
    cards.push({
      id: recipe.id,
      title: recipe.title,
      href: `${base}/recipes/${slug}`,
      imageUrl: recipe.imageUrl ?? null,
      imageAlt: recipe.imageAlt ?? recipe.title,
    });
  }
  return cards;
}

export type { NewsletterRecipeBlockItem };
