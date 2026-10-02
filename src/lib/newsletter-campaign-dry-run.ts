/**
 * Phase 12D — Newsletter campaign dry-run audience analysis.
 *
 * Aggregate-only. No Resend. No campaign/subscriber writes.
 * No recipient emails or member IDs returned to callers that render UI.
 */

import { getDb } from "@/lib/db";
import {
  collectNewsletterCampaignRecipeIds,
  type NewsletterCampaignDryRunResult,
  type NewsletterCampaignMutationResult,
} from "@/lib/newsletter-campaign-admin";
import {
  getNewsletterCampaignSendReadiness,
  selectNewsletterCampaignRecipeSelection,
  type NewsletterCampaignContent,
} from "@/lib/newsletter-campaign";
import {
  getNewsletterCampaignById,
  resolveNewsletterCampaignRecipes,
} from "@/lib/newsletter-campaign-server";
import {
  NEWSLETTER_INTEREST_PROFILE_BATCH_MAX,
  loadNewsletterInterestProfilesForEmails,
} from "@/lib/newsletter-interest-profile-server";
import { isNewsletterRecipientEligible } from "@/lib/newsletter-personalization";
import { siteUrl } from "@/lib/email";

/** Page size for dry-run subscriber scans (≤ interest-profile batch max). */
export const NEWSLETTER_CAMPAIGN_DRY_RUN_PAGE_SIZE = Math.min(
  250,
  NEWSLETTER_INTEREST_PROFILE_BATCH_MAX,
);

export type { NewsletterCampaignDryRunResult };

/**
 * Query plan per page (no N+1):
 * 1. NewsletterSubscriber page (id, email, status) — active-first scan with cursor
 * 2. User email batch (via loadNewsletterInterestProfilesForEmails)
 * 3. UserSeriesFollow batch
 * 4. UserCategoryFollow batch
 * Recipe pool: loaded once before paging.
 */
export async function runNewsletterCampaignDryRun(input: {
  campaignId: string;
  /** Explicit Admin simulation — may differ from live Production gate. */
  personalizationEnabled: boolean;
  maxPages?: number;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignDryRunResult>> {
  const campaign = await getNewsletterCampaignById(input.campaignId);
  if (!campaign) {
    return { ok: false, code: "not_found", message: "Campaign not found." };
  }

  const recipeIds = collectNewsletterCampaignRecipeIds(campaign.content);
  const resolved = await resolveNewsletterCampaignRecipes(recipeIds, {
    baseUrl: siteUrl(),
  });
  const readiness = getNewsletterCampaignSendReadiness({
    name: campaign.name,
    status: campaign.status,
    content: campaign.content,
    resolvedRecipes: resolved,
  });

  const maxPages = Math.min(40, Math.max(1, Math.floor(Number(input.maxPages) || 40)));
  const pageSize = NEWSLETTER_CAMPAIGN_DRY_RUN_PAGE_SIZE;

  let eligibleRecipients = 0;
  let personalizedRecipients = 0;
  let fallbackRecipients = 0;
  let ineligibleRowsSkipped = 0;
  let profileLoadWarnings = 0;
  let pagesScanned = 0;
  let cursor: string | undefined;

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const rows = await getDb().newsletterSubscriber.findMany({
        orderBy: [{ id: "asc" }],
        take: pageSize,
        ...(cursor
          ? { skip: 1, cursor: { id: cursor } }
          : {}),
        select: {
          id: true,
          email: true,
          status: true,
        },
      });

      if (rows.length === 0) break;
      pagesScanned += 1;
      cursor = rows[rows.length - 1]!.id;

      const eligibleEmails: string[] = [];
      for (const row of rows) {
        if (!isNewsletterRecipientEligible(row)) {
          ineligibleRowsSkipped += 1;
          continue;
        }
        eligibleEmails.push(String(row.email).trim().toLowerCase());
      }

      eligibleRecipients += eligibleEmails.length;

      if (!input.personalizationEnabled || eligibleEmails.length === 0) {
        fallbackRecipients += eligibleEmails.length;
        if (rows.length < pageSize) break;
        continue;
      }

      const { profiles } = await loadNewsletterInterestProfilesForEmails(eligibleEmails);

      for (const email of eligibleEmails) {
        const profile = profiles.get(email);
        if (!profile) {
          profileLoadWarnings += 1;
          fallbackRecipients += 1;
          continue;
        }
        const selection = selectNewsletterCampaignRecipeSelection({
          content: campaign.content as NewsletterCampaignContent,
          resolvedRecipes: resolved,
          profile,
          personalizationEnabled: true,
        });
        if (selection.block.mode === "personalized") {
          personalizedRecipients += 1;
        } else {
          fallbackRecipients += 1;
        }
      }

      if (rows.length < pageSize) break;
    }
  } catch (error) {
    // Systemic DB failure — do not fake all-fallback.
    const message =
      error instanceof Error ? error.message : "Dry run failed due to a database error.";
    return { ok: false, code: "conflict", message };
  }

  return {
    ok: true,
    data: {
      eligibleRecipients,
      personalizedRecipients,
      fallbackRecipients,
      ineligibleRowsSkipped,
      profileLoadWarnings,
      campaignReady: readiness.ready,
      issues: readiness.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
      personalizationEnabled: Boolean(input.personalizationEnabled),
      pagesScanned,
    },
  };
}
