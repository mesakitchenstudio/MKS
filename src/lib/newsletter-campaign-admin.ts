/**
 * Phase 12D — Newsletter campaign Admin domain (pure validation + list types).
 * No Resend. No status→sending/sent. No sentAt/sendStartedAt writes.
 */

import {
  NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_INTRO_MAX,
  NEWSLETTER_CAMPAIGN_NAME_MAX,
  NEWSLETTER_CAMPAIGN_PREHEADER_MAX,
  NEWSLETTER_CAMPAIGN_SUBJECT_MAX,
  dedupeNewsletterRecipeIdsPreserveOrder,
  isNewsletterCampaignEditable,
  normalizeNewsletterCampaignContent,
  type NewsletterCampaignContent,
  type ResolvedNewsletterCampaignRecipe,
} from "@/lib/newsletter-campaign";
import { normalizeRecipePublicationStatus } from "@/lib/recipe-schedule";

export type NewsletterCampaignAdminListItem = {
  id: string;
  name: string;
  status: string;
  subject: string;
  updatedAt: Date;
  createdAt: Date;
  sentAt: Date | null;
  ready: boolean | null;
};

export type NewsletterCampaignMutationErrorCode =
  | "unauthorized"
  | "not_found"
  | "locked"
  | "invalid_name"
  | "invalid_content"
  | "invalid_recipe"
  | "too_many_defaults"
  | "too_many_candidates"
  | "conflict";

export type NewsletterCampaignMutationResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: NewsletterCampaignMutationErrorCode; message: string };

export function newsletterCampaignReadinessLabel(ready: boolean) {
  return ready ? "Ready" : "Not ready";
}

/** Collect all Recipe IDs referenced by campaign content. */
export function collectNewsletterCampaignRecipeIds(
  content: NewsletterCampaignContent,
): string[] {
  return dedupeNewsletterRecipeIdsPreserveOrder([
    ...(content.featuredRecipeId ? [content.featuredRecipeId] : []),
    ...content.defaultRecipeIds,
    ...content.candidateRecipeIds,
  ]);
}

/**
 * Strict update validation.
 * - New IDs (not in previous) must resolve Published.
 * - Existing previous IDs may be retained even if now Draft/missing.
 * - Reject over-limit raw arrays (do not silently drop editor selection).
 */
export function validateNewsletterCampaignContentUpdate(input: {
  previous: NewsletterCampaignContent;
  nextRaw: unknown;
  resolved: Map<string, ResolvedNewsletterCampaignRecipe>;
}): NewsletterCampaignMutationResult<NewsletterCampaignContent> {
  let parsed: unknown = input.nextRaw;
  if (typeof input.nextRaw === "string") {
    try {
      parsed = JSON.parse(input.nextRaw);
    } catch {
      return { ok: false, code: "invalid_content", message: "Campaign content is invalid." };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "invalid_content", message: "Campaign content is invalid." };
  }
  const record = parsed as Record<string, unknown>;

  const subject = String(record.subject ?? "");
  if (subject.trim().length > NEWSLETTER_CAMPAIGN_SUBJECT_MAX) {
    return {
      ok: false,
      code: "invalid_content",
      message: `Subject must be at most ${NEWSLETTER_CAMPAIGN_SUBJECT_MAX} characters.`,
    };
  }
  const preheader = String(record.preheader ?? "");
  if (preheader.trim().length > NEWSLETTER_CAMPAIGN_PREHEADER_MAX) {
    return {
      ok: false,
      code: "invalid_content",
      message: `Preheader must be at most ${NEWSLETTER_CAMPAIGN_PREHEADER_MAX} characters.`,
    };
  }
  const intro = String(record.intro ?? "");
  if (intro.trim().length > NEWSLETTER_CAMPAIGN_INTRO_MAX) {
    return {
      ok: false,
      code: "invalid_content",
      message: `Intro must be at most ${NEWSLETTER_CAMPAIGN_INTRO_MAX} characters.`,
    };
  }

  const rawDefaults = Array.isArray(record.defaultRecipeIds) ? record.defaultRecipeIds : [];
  const rawCandidates = Array.isArray(record.candidateRecipeIds)
    ? record.candidateRecipeIds
    : [];
  const defaultIds = dedupeNewsletterRecipeIdsPreserveOrder(rawDefaults);
  const candidateIds = dedupeNewsletterRecipeIdsPreserveOrder(rawCandidates);

  if (defaultIds.length > NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX) {
    return {
      ok: false,
      code: "too_many_defaults",
      message: `At most ${NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX} default Recipes are allowed.`,
    };
  }

  // Candidate cap after defaults are merged (same rule as normalize).
  const mergedCandidates = dedupeNewsletterRecipeIdsPreserveOrder([
    ...candidateIds,
    ...defaultIds,
  ]);
  if (mergedCandidates.length > NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX) {
    return {
      ok: false,
      code: "too_many_candidates",
      message: `At most ${NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX} candidate Recipes are allowed.`,
    };
  }

  const featuredRaw = String(record.featuredRecipeId ?? "").trim();
  const featuredRecipeId = featuredRaw || null;

  const previousIds = new Set(collectNewsletterCampaignRecipeIds(input.previous));
  const nextIds = dedupeNewsletterRecipeIdsPreserveOrder([
    ...(featuredRecipeId ? [featuredRecipeId] : []),
    ...defaultIds,
    ...mergedCandidates,
  ]);

  for (const id of nextIds) {
    if (previousIds.has(id)) continue; // retain existing unavailable
    const row = input.resolved.get(id);
    if (!row) {
      return {
        ok: false,
        code: "invalid_recipe",
        message: `Recipe ${id} was not found.`,
      };
    }
    if (normalizeRecipePublicationStatus(row.status) !== "published") {
      return {
        ok: false,
        code: "invalid_recipe",
        message: `Only Published Recipes can be newly selected (${row.title || id}).`,
      };
    }
  }

  const content = normalizeNewsletterCampaignContent({
    subject,
    preheader,
    intro,
    featuredRecipeId,
    defaultRecipeIds: defaultIds,
    candidateRecipeIds: mergedCandidates,
  });

  return { ok: true, data: content };
}

export function validateNewsletterCampaignName(
  raw: unknown,
): NewsletterCampaignMutationResult<string> {
  const name = String(raw ?? "").trim();
  if (!name) {
    return { ok: false, code: "invalid_name", message: "Campaign name is required." };
  }
  if (name.length > NEWSLETTER_CAMPAIGN_NAME_MAX) {
    return {
      ok: false,
      code: "invalid_name",
      message: `Campaign name must be at most ${NEWSLETTER_CAMPAIGN_NAME_MAX} characters.`,
    };
  }
  return { ok: true, data: name };
}

export function assertNewsletterCampaignEditableStatus(
  status: string | null | undefined,
): NewsletterCampaignMutationResult {
  if (!isNewsletterCampaignEditable(status)) {
    return {
      ok: false,
      code: "locked",
      message: "Only draft campaigns can be edited or deleted.",
    };
  }
  return { ok: true, data: undefined };
}

export type NewsletterCampaignPreviewMode = "general" | "series" | "category";

export const NEWSLETTER_CAMPAIGN_PREVIEW_UNSUBSCRIBE_URL =
  "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=preview";

export type NewsletterCampaignPickerRecipe = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

export type NewsletterCampaignPreviewResult = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  blockMode: "personalized" | "fallback";
  blockHeading: string;
  explanation: string[];
  readinessReady: boolean;
  readinessIssues: { code: string; message: string }[];
  featuredTitle: string | null;
};

export type NewsletterCampaignDryRunResult = {
  eligibleRecipients: number;
  personalizedRecipients: number;
  fallbackRecipients: number;
  ineligibleRowsSkipped: number;
  profileLoadWarnings: number;
  campaignReady: boolean;
  issues: { code: string; message: string }[];
  personalizationEnabled: boolean;
  pagesScanned: number;
};
