/**
 * Phase 12B — Newsletter personalization domain (pure).
 *
 * Consent SoT remains NewsletterSubscriber — follows are content interest only.
 * No DB, environment reads, provider calls, wall-clock time, or randomness in scoring/selection.
 */

import { validateNewsletterEmail } from "@/lib/newsletter";
import { isActiveNewsletterStatus } from "@/lib/newsletter-unsubscribe";
import { normalizeRecipePublicationStatus } from "@/lib/recipe-schedule";

/** Default personalized / block size. */
export const NEWSLETTER_RECIPE_BLOCK_LIMIT = 3;
/** Hard ceiling for any block/recommendation call. */
export const NEWSLETTER_RECIPE_BLOCK_HARD_MAX = 4;

/** Explicit Series follow match (once per candidate). */
export const NEWSLETTER_SCORE_SERIES_FOLLOW = 200;
/** Explicit Category follow match (per category, then capped). */
export const NEWSLETTER_SCORE_CATEGORY_FOLLOW = 100;
/** Cap total category contribution so multi-category rows cannot dominate. */
export const NEWSLETTER_SCORE_CATEGORY_FOLLOW_CAP = 200;
/**
 * Minimum score for personalized inclusion.
 * Category-only (+100) or Series (+200) pass; freshness alone never does.
 */
export const NEWSLETTER_PERSONALIZATION_MIN_SCORE = 100;

/** Soft diversity: at most this many picks sharing one primary interest when others exist. */
export const NEWSLETTER_DIVERSITY_MAX_PER_INTEREST = 2;

export type NewsletterRecipientLike = {
  email: string;
  status: string | null | undefined;
};

/**
 * Narrow interest profile for pure scoring.
 * IDs only — never email, name, private notes, free-text interactions, or collection titles.
 */
export type NewsletterInterestProfile = {
  userId?: string | null;
  followedSeriesIds: string[];
  followedCategoryIds: string[];
};

export type NewsletterRecipeCandidate = {
  id: string;
  title: string;
  publishedAt: Date | string | null;
  status: string;
  seriesIds: string[];
  categoryIds: string[];
};

export type NewsletterRecommendationReason =
  | { kind: "series_follow"; seriesId: string }
  | { kind: "category_follow"; categoryId: string };

export type NewsletterScoredRecommendation = {
  recipeId: string;
  score: number;
  reasons: NewsletterRecommendationReason[];
  /** Diversity key only — first matched Series ID, else first matched Category ID. */
  primaryInterestKey: string;
  publishedAt: Date | string | null;
};

export type NewsletterRecipeBlockItem = {
  recipeId: string;
  source: "personalized" | "fallback";
  reasons: NewsletterRecommendationReason[];
};

export type NewsletterRecipeBlockResult = {
  items: NewsletterRecipeBlockItem[];
  mode: "personalized" | "fallback";
};

/** Stable unique sorted ID list (empty strings dropped). */
export function canonicalizeNewsletterIdList(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a, b) => a.localeCompare(b, "en"));
  return out;
}

export function emptyNewsletterInterestProfile(
  userId?: string | null,
): NewsletterInterestProfile {
  return {
    userId: userId?.trim() || null,
    followedSeriesIds: [],
    followedCategoryIds: [],
  };
}

export function normalizeNewsletterInterestProfile(
  profile: NewsletterInterestProfile,
): NewsletterInterestProfile {
  return {
    userId: profile.userId?.trim() || null,
    followedSeriesIds: canonicalizeNewsletterIdList(profile.followedSeriesIds),
    followedCategoryIds: canonicalizeNewsletterIdList(profile.followedCategoryIds),
  };
}

/**
 * Newsletter marketing recipient eligibility only.
 * SoT: NewsletterSubscriber status + valid normalized email.
 * Does NOT consult legacy member notify flags, follows, saves, or feature gate.
 * Future suppression checks can extend this helper centrally.
 */
export function isNewsletterRecipientEligible(
  subscriber: NewsletterRecipientLike | null | undefined,
): boolean {
  if (!subscriber) return false;
  if (!isActiveNewsletterStatus(subscriber.status)) return false;
  const email = validateNewsletterEmail(subscriber.email);
  return email.ok;
}

export function isNewsletterRecipeCandidatePublished(
  candidate: Pick<NewsletterRecipeCandidate, "status">,
): boolean {
  return normalizeRecipePublicationStatus(candidate.status) === "published";
}

function publishedAtMs(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

function clampBlockLimit(limit: number | undefined): number {
  const raw = limit == null ? NEWSLETTER_RECIPE_BLOCK_LIMIT : Math.floor(Number(limit));
  if (!Number.isFinite(raw) || raw < 1) return NEWSLETTER_RECIPE_BLOCK_LIMIT;
  return Math.min(raw, NEWSLETTER_RECIPE_BLOCK_HARD_MAX);
}

/**
 * Dedupe candidates by id. Conflicting duplicates: first Published wins;
 * if neither/both published, first occurrence wins. Draft-only dupes dropped later.
 */
export function normalizeNewsletterCandidates(
  candidates: NewsletterRecipeCandidate[],
): NewsletterRecipeCandidate[] {
  const byId = new Map<string, NewsletterRecipeCandidate>();
  for (const raw of candidates) {
    const id = String(raw?.id ?? "").trim();
    if (!id) continue;
    const seriesIds = canonicalizeNewsletterIdList(raw.seriesIds ?? []);
    const categoryIds = canonicalizeNewsletterIdList(raw.categoryIds ?? []);
    const next: NewsletterRecipeCandidate = {
      id,
      title: String(raw.title ?? "").trim(),
      publishedAt: raw.publishedAt ?? null,
      status: String(raw.status ?? ""),
      seriesIds,
      categoryIds,
    };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, next);
      continue;
    }
    const existingPublished = isNewsletterRecipeCandidatePublished(existing);
    const nextPublished = isNewsletterRecipeCandidatePublished(next);
    if (!existingPublished && nextPublished) {
      byId.set(id, next);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export type NewsletterRecipeScoreResult = {
  recipeId: string;
  score: number;
  reasons: NewsletterRecommendationReason[];
  primaryInterestKey: string;
};

/**
 * Score one candidate against an interest profile.
 * Series contribution: +200 once (even if multiple Series match).
 * Category contribution: +100 each, capped at +200.
 */
export function scoreNewsletterRecipeForProfile(
  profile: NewsletterInterestProfile,
  candidate: NewsletterRecipeCandidate,
): NewsletterRecipeScoreResult {
  const normalized = normalizeNewsletterInterestProfile(profile);
  const recipeId = String(candidate.id ?? "").trim();
  const followedSeries = new Set(normalized.followedSeriesIds);
  const followedCategories = new Set(normalized.followedCategoryIds);

  const matchedSeries = canonicalizeNewsletterIdList(
    (candidate.seriesIds ?? []).filter((id) => followedSeries.has(String(id).trim())),
  );
  const matchedCategories = canonicalizeNewsletterIdList(
    (candidate.categoryIds ?? []).filter((id) => followedCategories.has(String(id).trim())),
  );

  let score = 0;
  const reasons: NewsletterRecommendationReason[] = [];

  if (matchedSeries.length > 0) {
    score += NEWSLETTER_SCORE_SERIES_FOLLOW;
    for (const seriesId of matchedSeries) {
      reasons.push({ kind: "series_follow", seriesId });
    }
  }

  if (matchedCategories.length > 0) {
    const categoryScore = Math.min(
      NEWSLETTER_SCORE_CATEGORY_FOLLOW_CAP,
      matchedCategories.length * NEWSLETTER_SCORE_CATEGORY_FOLLOW,
    );
    score += categoryScore;
    for (const categoryId of matchedCategories) {
      reasons.push({ kind: "category_follow", categoryId });
    }
  }

  const primaryInterestKey =
    matchedSeries[0] ?? matchedCategories[0] ?? "";

  return { recipeId, score, reasons, primaryInterestKey };
}

function compareScored(
  a: NewsletterScoredRecommendation,
  b: NewsletterScoredRecommendation,
): number {
  if (b.score !== a.score) return b.score - a.score;
  const pub = publishedAtMs(b.publishedAt) - publishedAtMs(a.publishedAt);
  if (pub !== 0) return pub;
  return a.recipeId.localeCompare(b.recipeId, "en");
}

/**
 * Modest post-rank diversity: prefer ≤ NEWSLETTER_DIVERSITY_MAX_PER_INTEREST
 * from one primary interest when another interest still has eligible candidates.
 * Never fills with below-threshold items.
 */
function applyInterestDiversity(
  ranked: NewsletterScoredRecommendation[],
  limit: number,
): NewsletterScoredRecommendation[] {
  if (ranked.length <= limit) return ranked.slice(0, limit);

  const interestKeys = new Set(
    ranked.map((row) => row.primaryInterestKey).filter(Boolean),
  );
  const multiInterest = interestKeys.size >= 2;

  const picked: NewsletterScoredRecommendation[] = [];
  const deferred: NewsletterScoredRecommendation[] = [];
  const perInterest = new Map<string, number>();

  for (const entry of ranked) {
    if (picked.length >= limit) break;
    const key = entry.primaryInterestKey || "__none__";
    const used = perInterest.get(key) ?? 0;
    if (
      multiInterest &&
      key !== "__none__" &&
      used >= NEWSLETTER_DIVERSITY_MAX_PER_INTEREST
    ) {
      deferred.push(entry);
      continue;
    }
    perInterest.set(key, used + 1);
    picked.push(entry);
  }

  for (const entry of deferred) {
    if (picked.length >= limit) break;
    picked.push(entry);
  }

  return picked;
}

export type RecommendNewsletterRecipesInput = {
  profile: NewsletterInterestProfile;
  candidates: NewsletterRecipeCandidate[];
  excludedRecipeIds?: Iterable<string>;
  limit?: number;
};

/**
 * Pure personalized ranking from an editor-supplied candidate pool.
 * Published-only; respects exclusions; deterministic; no weak fillers.
 */
export function recommendNewsletterRecipes(
  input: RecommendNewsletterRecipesInput,
): NewsletterScoredRecommendation[] {
  const limit = clampBlockLimit(input.limit);
  const excluded = new Set(canonicalizeNewsletterIdList(input.excludedRecipeIds ?? []));
  const profile = normalizeNewsletterInterestProfile(input.profile);
  const candidates = normalizeNewsletterCandidates(input.candidates);

  const scored: NewsletterScoredRecommendation[] = [];
  for (const candidate of candidates) {
    if (excluded.has(candidate.id)) continue;
    if (!isNewsletterRecipeCandidatePublished(candidate)) continue;
    const result = scoreNewsletterRecipeForProfile(profile, candidate);
    if (result.score < NEWSLETTER_PERSONALIZATION_MIN_SCORE) continue;
    scored.push({
      recipeId: result.recipeId,
      score: result.score,
      reasons: result.reasons,
      primaryInterestKey: result.primaryInterestKey,
      publishedAt: candidate.publishedAt,
    });
  }

  scored.sort(compareScored);
  return applyInterestDiversity(scored, limit);
}

export type SelectNewsletterRecipeBlockInput = {
  profile: NewsletterInterestProfile;
  /** Campaign pool + any editorial default Recipes needed for resolution. */
  candidates: NewsletterRecipeCandidate[];
  /** Authoritative editorial fallback order (Recipe IDs). */
  fallbackRecipeIds: string[];
  excludedRecipeIds?: Iterable<string>;
  limit?: number;
};

/**
 * Personalized picks first, then fill from ordered editorial fallback IDs.
 * Personalized occurrence wins when an ID also appears in fallback.
 */
export function selectNewsletterRecipeBlock(
  input: SelectNewsletterRecipeBlockInput,
): NewsletterRecipeBlockResult {
  const limit = clampBlockLimit(input.limit);
  const excluded = new Set(canonicalizeNewsletterIdList(input.excludedRecipeIds ?? []));
  const byId = new Map(
    normalizeNewsletterCandidates(input.candidates).map((row) => [row.id, row]),
  );

  const personalized = recommendNewsletterRecipes({
    profile: input.profile,
    candidates: input.candidates,
    excludedRecipeIds: excluded,
    limit,
  });

  const items: NewsletterRecipeBlockItem[] = [];
  const used = new Set<string>();

  for (const row of personalized) {
    if (items.length >= limit) break;
    if (used.has(row.recipeId) || excluded.has(row.recipeId)) continue;
    items.push({
      recipeId: row.recipeId,
      source: "personalized",
      reasons: row.reasons,
    });
    used.add(row.recipeId);
  }

  for (const rawId of input.fallbackRecipeIds) {
    if (items.length >= limit) break;
    const id = String(rawId ?? "").trim();
    if (!id || used.has(id) || excluded.has(id)) continue;
    const candidate = byId.get(id);
    if (!candidate || !isNewsletterRecipeCandidatePublished(candidate)) continue;
    items.push({
      recipeId: id,
      source: "fallback",
      reasons: [],
    });
    used.add(id);
  }

  const mode = items.some((item) => item.source === "personalized")
    ? "personalized"
    : "fallback";

  return { items, mode };
}
