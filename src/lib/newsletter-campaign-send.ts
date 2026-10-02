/**
 * Phase 12E — Newsletter campaign send orchestration.
 *
 * Owner audience send + Owner test send. Atomic Draft→Sending claim.
 * No per-recipient delivery table. No automatic retry/resume.
 * Provider calls are injectable for tests (never hit Resend in unit tests).
 */

import { getDb } from "@/lib/db";
import { recordAdminAuditEvent, type AdminAuditActor } from "@/lib/admin-audit";
import { siteUrl } from "@/lib/email";
import { isNewsletterPersonalizationEnabled } from "@/lib/flags";
import {
  collectNewsletterCampaignRecipeIds,
  type NewsletterCampaignMutationResult,
  type NewsletterCampaignPreviewMode,
} from "@/lib/newsletter-campaign-admin";
import {
  buildNewsletterCampaignEmailRecipeCards,
  getNewsletterCampaignSendReadiness,
  selectNewsletterCampaignRecipeSelection,
  type NewsletterCampaignContent,
  type ResolvedNewsletterCampaignRecipe,
} from "@/lib/newsletter-campaign";
import {
  getNewsletterCampaignById,
  resolveNewsletterCampaignRecipes,
  type NewsletterCampaignRecord,
} from "@/lib/newsletter-campaign-server";
import {
  buildNewsletterCampaignEmail,
} from "@/lib/newsletter-campaign-email";
import {
  loadNewsletterInterestProfilesForEmails,
  NEWSLETTER_INTEREST_PROFILE_BATCH_MAX,
} from "@/lib/newsletter-interest-profile-server";
import {
  emptyNewsletterInterestProfile,
  isNewsletterRecipientEligible,
} from "@/lib/newsletter-personalization";
import {
  buildNewsletterOneClickUnsubscribeUrl,
  buildNewsletterUnsubscribeHeaders,
  buildNewsletterUnsubscribeUrl,
  buildSignedNewsletterUnsubscribeToken,
  getNewsletterUnsubscribeSigningSecret,
} from "@/lib/newsletter-unsubscribe";
import {
  isNewsletterMarketingEmailConfigured,
  sendNewsletterMarketingEmailDetailed,
  type NewsletterMarketingMailer,
} from "@/lib/newsletter-marketing-email";
import { isFollowableCategoryGroup } from "@/lib/member-follows";

export const NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE = Math.min(
  250,
  NEWSLETTER_INTEREST_PROFILE_BATCH_MAX,
);

/** Bounded provider concurrency — never unbounded Promise.all over the audience. */
export const NEWSLETTER_SEND_PROVIDER_CONCURRENCY = 3;

export const NEWSLETTER_CAMPAIGN_TEST_FOOTER =
  "This is a test email. No newsletter subscription was changed.";

export type NewsletterCampaignSendAggregates = {
  eligible: number;
  attempted: number;
  succeeded: number;
  failed: number;
  personalized: number;
  fallback: number;
  skippedInvalid: number;
  personalizationEnabled: boolean;
};

export type NewsletterCampaignAudienceSendResult = NewsletterCampaignSendAggregates & {
  campaignId: string;
  status: "sent" | "sending" | "draft";
  releasedClaim: boolean;
  message: string;
};

export type NewsletterCampaignTestSendResult = {
  campaignId: string;
  toDomain: string;
  subject: string;
  blockMode: "personalized" | "fallback";
};

function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 0) return "unknown";
  return email.slice(at + 1).toLowerCase() || "unknown";
}

function mapToCards(
  baseUrl: string,
  resolved: Map<string, ResolvedNewsletterCampaignRecipe>,
  recipeIds: string[],
) {
  const recipes = recipeIds
    .map((id) => resolved.get(id))
    .filter((row): row is ResolvedNewsletterCampaignRecipe => Boolean(row));
  return buildNewsletterCampaignEmailRecipeCards({ baseUrl, recipes });
}

async function countEligibleNewsletterRecipients(): Promise<number> {
  const pageSize = NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE;
  let eligible = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 40; page += 1) {
    const rows = await getDb().newsletterSubscriber.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, email: true, status: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    for (const row of rows) {
      if (isNewsletterRecipientEligible(row)) eligible += 1;
    }
    if (rows.length < pageSize) break;
  }
  return eligible;
}

export type NewsletterCampaignSendConfirmInfo = {
  campaignId: string;
  name: string;
  status: string;
  eligibleCount: number;
  personalizationEnabled: boolean;
  readinessReady: boolean;
  readinessIssues: string[];
  providerConfigured: boolean;
  signingSecretConfigured: boolean;
};

/**
 * Owner confirmation dialog data — recomputed server-side; no claim, no provider calls.
 */
export async function getNewsletterCampaignSendConfirmInfo(
  campaignId: string,
): Promise<NewsletterCampaignMutationResult<NewsletterCampaignSendConfirmInfo>> {
  const id = String(campaignId ?? "").trim();
  if (!id) {
    return { ok: false, code: "not_found", message: "Campaign not found." };
  }
  const campaign = await getNewsletterCampaignById(id);
  if (!campaign) {
    return { ok: false, code: "not_found", message: "Campaign not found." };
  }

  const personalizationEnabled = isNewsletterPersonalizationEnabled();
  const providerConfigured = isNewsletterMarketingEmailConfigured();
  const signingSecretConfigured = Boolean(getNewsletterUnsubscribeSigningSecret());

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
  const eligibleCount = await countEligibleNewsletterRecipients();

  return {
    ok: true,
    data: {
      campaignId: campaign.id,
      name: campaign.name,
      status: campaign.status,
      eligibleCount,
      personalizationEnabled,
      readinessReady: readiness.ready,
      readinessIssues: readiness.issues.map((issue) => issue.message),
      providerConfigured,
      signingSecretConfigured,
    },
  };
}

export type NewsletterCampaignSendSummary = {
  action: string;
  createdAt: Date;
  eligible?: number;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  personalized?: number;
  fallback?: number;
  skippedInvalid?: number;
  personalizationEnabled?: boolean;
  message?: string;
};

/** Latest safe send aggregate from AdminAudit (no PII). */
export async function getLatestNewsletterCampaignSendSummary(
  campaignId: string,
): Promise<NewsletterCampaignSendSummary | null> {
  const id = String(campaignId ?? "").trim();
  if (!id) return null;
  const rows = await getDb().adminAuditEvent.findMany({
    where: {
      entityType: "NewsletterCampaign",
      entityId: id,
      action: {
        in: [
          "newsletter_campaign.sent",
          "newsletter_campaign.send_failed",
          "newsletter_campaign.send_started",
        ],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
  });
  const preferred =
    rows.find((row) => row.action === "newsletter_campaign.sent") ??
    rows.find((row) => row.action === "newsletter_campaign.send_failed") ??
    rows[0];
  if (!preferred) return null;
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(preferred.metadata || "{}") as unknown;
    if (parsed && typeof parsed === "object") metadata = parsed as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  const num = (key: string) =>
    typeof metadata[key] === "number" && Number.isFinite(metadata[key] as number)
      ? (metadata[key] as number)
      : undefined;
  return {
    action: preferred.action,
    createdAt: preferred.createdAt,
    eligible: num("eligible"),
    attempted: num("attempted"),
    succeeded: num("succeeded"),
    failed: num("failed"),
    personalized: num("personalized"),
    fallback: num("fallback"),
    skippedInvalid: num("skippedInvalid"),
    personalizationEnabled:
      typeof metadata.personalizationEnabled === "boolean"
        ? metadata.personalizationEnabled
        : undefined,
  };
}

export async function claimNewsletterCampaignForSend(
  campaignId: string,
): Promise<{ ok: true; sendStartedAt: Date } | { ok: false; reason: "not_claimable" }> {
  const sendStartedAt = new Date();
  const result = await getDb().newsletterCampaign.updateMany({
    where: {
      id: campaignId,
      status: "draft",
      sentAt: null,
      sendStartedAt: null,
    },
    data: {
      status: "sending",
      sendStartedAt,
    },
  });
  if (result.count !== 1) {
    return { ok: false, reason: "not_claimable" };
  }
  return { ok: true, sendStartedAt };
}

export async function releaseNewsletterCampaignClaimIfUnattempted(
  campaignId: string,
): Promise<boolean> {
  const result = await getDb().newsletterCampaign.updateMany({
    where: {
      id: campaignId,
      status: "sending",
      sentAt: null,
    },
    data: {
      status: "draft",
      sendStartedAt: null,
    },
  });
  return result.count === 1;
}

export async function finalizeNewsletterCampaignSent(campaignId: string): Promise<boolean> {
  const result = await getDb().newsletterCampaign.updateMany({
    where: {
      id: campaignId,
      status: "sending",
      sentAt: null,
    },
    data: {
      status: "sent",
      sentAt: new Date(),
    },
  });
  return result.count === 1;
}

async function runBoundedConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const limit = Math.max(1, Math.min(concurrency, NEWSLETTER_SEND_PROVIDER_CONCURRENCY));
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]!);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
}

function renderCampaignEmail(input: {
  content: NewsletterCampaignContent;
  subject: string;
  selection: ReturnType<typeof selectNewsletterCampaignRecipeSelection>;
  resolved: Map<string, ResolvedNewsletterCampaignRecipe>;
  baseUrl: string;
  unsubscribeUrl: string;
  footerNote?: string | null;
}) {
  const featuredCards = input.selection.featured
    ? buildNewsletterCampaignEmailRecipeCards({
        baseUrl: input.baseUrl,
        recipes: [input.selection.featured],
      })
    : [];
  const blockCards = mapToCards(
    input.baseUrl,
    input.resolved,
    input.selection.block.items.map((item) => item.recipeId),
  );
  return buildNewsletterCampaignEmail({
    subject: input.subject,
    preheader: input.content.preheader,
    intro: input.content.intro,
    featured: featuredCards[0] ?? null,
    blockRecipes: blockCards,
    blockMode: input.selection.block.mode,
    unsubscribeUrl: input.unsubscribeUrl,
    footerNote: input.footerNote,
  });
}

/**
 * Owner test send — one message to the Owner email. No campaign claim/status mutation.
 */
export async function sendNewsletterCampaignTestEmail(input: {
  campaignId: string;
  ownerEmail: string;
  actor: AdminAuditActor;
  mode: NewsletterCampaignPreviewMode;
  seriesId?: string | null;
  categoryId?: string | null;
  /** Simulation for test preview modes only — not the live audience gate. */
  personalizationSimulation: boolean;
  mailer?: NewsletterMarketingMailer;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignTestSendResult>> {
  const ownerEmail = String(input.ownerEmail ?? "").trim().toLowerCase();
  if (!ownerEmail || !ownerEmail.includes("@")) {
    return { ok: false, code: "invalid_content", message: "Owner email is unavailable." };
  }

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
    status: "draft",
    content: campaign.content,
    resolvedRecipes: resolved,
  });
  // Test send requires enough structure to avoid broken Recipe links.
  const blocking = readiness.issues.filter((issue) =>
    [
      "missing_subject",
      "missing_defaults",
      "draft_default_recipe",
      "missing_default_recipe",
      "invalid_default_recipe",
      "draft_featured_recipe",
      "missing_featured_recipe",
      "invalid_featured_recipe",
    ].includes(issue.code),
  );
  if (blocking.length > 0) {
    return {
      ok: false,
      code: "invalid_content",
      message: blocking.map((issue) => issue.message).join(" "),
    };
  }

  if (!isNewsletterMarketingEmailConfigured() && !input.mailer) {
    return {
      ok: false,
      code: "conflict",
      message: "Email provider is not configured.",
    };
  }

  let profile = emptyNewsletterInterestProfile(null);
  if (input.mode === "series" && input.seriesId) {
    const series = await getDb().series.findUnique({
      where: { id: input.seriesId },
      select: { id: true, isPublished: true },
    });
    if (series?.isPublished) {
      profile = {
        userId: null,
        followedSeriesIds: [series.id],
        followedCategoryIds: [],
      };
    }
  } else if (input.mode === "category" && input.categoryId) {
    const category = await getDb().category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, group: true },
    });
    if (category && isFollowableCategoryGroup(category.group)) {
      profile = {
        userId: null,
        followedSeriesIds: [],
        followedCategoryIds: [category.id],
      };
    }
  }

  const personalize =
    Boolean(input.personalizationSimulation) && input.mode !== "general";
  const selection = selectNewsletterCampaignRecipeSelection({
    content: campaign.content,
    resolvedRecipes: resolved,
    profile,
    personalizationEnabled: personalize,
  });

  const subjectBase = campaign.content.subject.trim() || campaign.name;
  const subject = `[TEST] ${subjectBase}`;
  const email = renderCampaignEmail({
    content: campaign.content,
    subject: subjectBase,
    selection,
    resolved,
    baseUrl: siteUrl().replace(/\/$/, ""),
    unsubscribeUrl: "",
    footerNote: NEWSLETTER_CAMPAIGN_TEST_FOOTER,
  });

  const mailer = input.mailer ?? sendNewsletterMarketingEmailDetailed;
  const sendResult = await mailer({
    to: ownerEmail,
    subject,
    html: email.html,
    text: email.text,
    // No production List-Unsubscribe headers on test send.
  });
  if (!sendResult.ok) {
    return {
      ok: false,
      code: "conflict",
      message:
        sendResult.reason === "not_configured"
          ? "Email provider is not configured."
          : "Test email could not be delivered.",
    };
  }

  // Confirm campaign timestamps untouched.
  const after = await getNewsletterCampaignById(campaign.id);
  if (
    !after ||
    after.status !== campaign.status ||
    (after.sentAt?.getTime() ?? null) !== (campaign.sentAt?.getTime() ?? null) ||
    (after.sendStartedAt?.getTime() ?? null) !== (campaign.sendStartedAt?.getTime() ?? null)
  ) {
    return {
      ok: false,
      code: "conflict",
      message: "Campaign state changed unexpectedly during test send.",
    };
  }

  await recordAdminAuditEvent({
    actor: input.actor,
    action: "newsletter_campaign.test_sent",
    area: "content",
    entityType: "NewsletterCampaign",
    entityId: campaign.id,
    entityLabel: campaign.name,
    entityPath: `/admin/newsletter/campaigns/${campaign.id}`,
    metadata: {
      status: campaign.status,
      mode: input.mode,
      blockMode: selection.block.mode,
      toDomain: emailDomain(ownerEmail),
    },
  });

  return {
    ok: true,
    data: {
      campaignId: campaign.id,
      toDomain: emailDomain(ownerEmail),
      subject,
      blockMode: selection.block.mode,
    },
  };
}

/**
 * Owner audience send. Preflight → atomic claim → provider loop → terminal sent
 * (or fail-closed sending / optional pre-attempt release).
 */
export async function sendNewsletterCampaignToAudience(input: {
  campaignId: string;
  actor: AdminAuditActor;
  mailer?: NewsletterMarketingMailer;
  /** Injected for tests; live sends always use env gate. */
  personalizationEnabled?: boolean;
  /** Test seam: runs after claim + send_started audit, before recipient loop. */
  onAfterClaim?: () => Promise<void>;
  /** Test seam: override eligible count preflight (production always recounts). */
  countEligible?: () => Promise<number>;
  /** Test seam: override recipient paging (production always queries NewsletterSubscriber). */
  loadRecipientPage?: (
    cursor: string | undefined,
    pageSize: number,
  ) => Promise<Array<{ id: string; email: string; status: string }>>;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignAudienceSendResult>> {
  const campaignId = String(input.campaignId ?? "").trim();
  if (!campaignId) {
    return { ok: false, code: "not_found", message: "Campaign not found." };
  }

  // --- Preflight (non-mutating) ---
  const campaign = await getNewsletterCampaignById(campaignId);
  if (!campaign) {
    return { ok: false, code: "not_found", message: "Campaign not found." };
  }
  if (campaign.status === "sending") {
    return {
      ok: false,
      code: "locked",
      message: "Campaign is already sending.",
    };
  }
  if (campaign.status === "sent") {
    return {
      ok: false,
      code: "locked",
      message: "Campaign has already been sent.",
    };
  }
  if (campaign.status !== "draft") {
    return { ok: false, code: "locked", message: "Only draft campaigns can be sent." };
  }

  const personalizationEnabled =
    input.personalizationEnabled === undefined
      ? isNewsletterPersonalizationEnabled()
      : Boolean(input.personalizationEnabled);

  if (!isNewsletterMarketingEmailConfigured() && !input.mailer) {
    return {
      ok: false,
      code: "conflict",
      message: "Email provider is not configured.",
    };
  }

  if (!getNewsletterUnsubscribeSigningSecret()) {
    return {
      ok: false,
      code: "conflict",
      message: "Newsletter unsubscribe signing secret is not configured.",
    };
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
  if (!readiness.ready) {
    return {
      ok: false,
      code: "invalid_content",
      message: readiness.issues.map((issue) => issue.message).join(" "),
    };
  }

  const eligibleCount = input.countEligible
    ? await input.countEligible()
    : await countEligibleNewsletterRecipients();
  if (eligibleCount <= 0) {
    return {
      ok: false,
      code: "conflict",
      message: "No eligible newsletter recipients.",
    };
  }

  // --- Atomic claim ---
  const claim = await claimNewsletterCampaignForSend(campaignId);
  if (!claim.ok) {
    return {
      ok: false,
      code: "locked",
      message: "Campaign could not be claimed for sending (already sending or sent).",
    };
  }

  await recordAdminAuditEvent({
    actor: input.actor,
    action: "newsletter_campaign.send_started",
    area: "content",
    entityType: "NewsletterCampaign",
    entityId: campaignId,
    entityLabel: campaign.name,
    entityPath: `/admin/newsletter/campaigns/${campaignId}`,
    metadata: {
      eligible: eligibleCount,
      personalizationEnabled,
    },
  });

  if (input.onAfterClaim) {
    try {
      await input.onAfterClaim();
    } catch {
      const released = await releaseNewsletterCampaignClaimIfUnattempted(campaignId);
      await recordAdminAuditEvent({
        actor: input.actor,
        action: "newsletter_campaign.send_failed",
        area: "content",
        entityType: "NewsletterCampaign",
        entityId: campaignId,
        entityLabel: campaign.name,
        entityPath: `/admin/newsletter/campaigns/${campaignId}`,
        metadata: {
          reason: "pre_attempt_failure",
          releasedClaim: released,
          attempted: 0,
          personalizationEnabled,
        },
      });
      return {
        ok: false,
        code: "conflict",
        message: "Send failed before any email was attempted.",
      };
    }
  }

  const aggregates: NewsletterCampaignSendAggregates = {
    eligible: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    personalized: 0,
    fallback: 0,
    skippedInvalid: 0,
    personalizationEnabled,
  };

  const mailer = input.mailer ?? sendNewsletterMarketingEmailDetailed;
  const baseUrl = siteUrl().replace(/\/$/, "");
  const pageSize = NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE;
  let cursor: string | undefined;
  let midSendException: unknown = null;

  try {
    for (let page = 0; page < 40; page += 1) {
      const rows = input.loadRecipientPage
        ? await input.loadRecipientPage(cursor, pageSize)
        : await getDb().newsletterSubscriber.findMany({
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: pageSize,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            select: { id: true, email: true, status: true },
          });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1]!.id;

      const eligibleRows: { id: string; email: string }[] = [];
      for (const row of rows) {
        if (!isNewsletterRecipientEligible(row)) {
          aggregates.skippedInvalid += 1;
          continue;
        }
        eligibleRows.push({
          id: row.id,
          email: String(row.email).trim().toLowerCase(),
        });
      }
      aggregates.eligible += eligibleRows.length;
      if (eligibleRows.length === 0) {
        if (rows.length < pageSize) break;
        continue;
      }

      let profiles = new Map<string, ReturnType<typeof emptyNewsletterInterestProfile>>();
      if (personalizationEnabled) {
        try {
          const loaded = await loadNewsletterInterestProfilesForEmails(
            eligibleRows.map((row) => row.email),
          );
          profiles = loaded.profiles;
        } catch (error) {
          // Systemic profile failure mid-send after possible prior pages.
          if (aggregates.attempted > 0) {
            throw error;
          }
          // Before first attempt: release claim and surface error.
          await releaseNewsletterCampaignClaimIfUnattempted(campaignId);
          await recordAdminAuditEvent({
            actor: input.actor,
            action: "newsletter_campaign.send_failed",
            area: "content",
            entityType: "NewsletterCampaign",
            entityId: campaignId,
            entityLabel: campaign.name,
            entityPath: `/admin/newsletter/campaigns/${campaignId}`,
            metadata: {
              reason: "profile_batch_failed",
              attempted: 0,
              personalizationEnabled,
            },
          });
          return {
            ok: false,
            code: "conflict",
            message: "Could not load member interest profiles for personalization.",
          };
        }
      }

      type WorkItem = {
        id: string;
        email: string;
        selection: ReturnType<typeof selectNewsletterCampaignRecipeSelection>;
      };
      const work: WorkItem[] = [];
      for (const row of eligibleRows) {
        let selection: ReturnType<typeof selectNewsletterCampaignRecipeSelection>;
        try {
          const profile = personalizationEnabled
            ? profiles.get(row.email) ?? emptyNewsletterInterestProfile(null)
            : emptyNewsletterInterestProfile(null);
          selection = selectNewsletterCampaignRecipeSelection({
            content: campaign.content,
            resolvedRecipes: resolved,
            profile,
            personalizationEnabled,
          });
        } catch {
          // Recipient-local personalization failure → editorial fallback; continue.
          selection = selectNewsletterCampaignRecipeSelection({
            content: campaign.content,
            resolvedRecipes: resolved,
            profile: emptyNewsletterInterestProfile(null),
            personalizationEnabled: false,
          });
        }
        if (selection.block.mode === "personalized") {
          aggregates.personalized += 1;
        } else {
          aggregates.fallback += 1;
        }
        work.push({ id: row.id, email: row.email, selection });
      }

      await runBoundedConcurrency(work, NEWSLETTER_SEND_PROVIDER_CONCURRENCY, async (item) => {
        const tokenResult = buildSignedNewsletterUnsubscribeToken({
          subscriberId: item.id,
        });
        if (!tokenResult.ok) {
          aggregates.attempted += 1;
          aggregates.failed += 1;
          return;
        }
        const humanUrl = buildNewsletterUnsubscribeUrl(tokenResult.token, baseUrl);
        const oneClickUrl = buildNewsletterOneClickUnsubscribeUrl(tokenResult.token, baseUrl);
        const headers = buildNewsletterUnsubscribeHeaders({
          humanUnsubscribeUrl: humanUrl,
          oneClickUnsubscribeUrl: oneClickUrl,
        });
        const email = renderCampaignEmail({
          content: campaign.content,
          subject: campaign.content.subject,
          selection: item.selection,
          resolved,
          baseUrl,
          unsubscribeUrl: humanUrl,
        });

        aggregates.attempted += 1;
        const result = await mailer({
          to: item.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers,
        });
        if (result.ok) {
          aggregates.succeeded += 1;
        } else {
          aggregates.failed += 1;
        }
      });

      if (rows.length < pageSize) break;
    }
  } catch (error) {
    midSendException = error;
  }

  if (midSendException) {
    if (aggregates.attempted === 0) {
      const released = await releaseNewsletterCampaignClaimIfUnattempted(campaignId);
      await recordAdminAuditEvent({
        actor: input.actor,
        action: "newsletter_campaign.send_failed",
        area: "content",
        entityType: "NewsletterCampaign",
        entityId: campaignId,
        entityLabel: campaign.name,
        entityPath: `/admin/newsletter/campaigns/${campaignId}`,
        metadata: {
          reason: "pre_attempt_failure",
          releasedClaim: released,
          ...aggregates,
        },
      });
      return {
        ok: false,
        code: "conflict",
        message: "Send failed before any email was attempted.",
        // mutation result type doesn't include data on failure — keep simple
      };
    }

    // Fail closed in sending.
    await recordAdminAuditEvent({
      actor: input.actor,
      action: "newsletter_campaign.send_failed",
      area: "content",
      entityType: "NewsletterCampaign",
      entityId: campaignId,
      entityLabel: campaign.name,
      entityPath: `/admin/newsletter/campaigns/${campaignId}`,
      metadata: {
        reason: "mid_send_exception",
        status: "sending",
        ...aggregates,
      },
    });
    return {
      ok: true,
      data: {
        campaignId,
        status: "sending",
        releasedClaim: false,
        message: "Send interrupted after delivery attempts. Campaign remains locked for review.",
        ...aggregates,
      },
    };
  }

  if (aggregates.attempted === 0 && aggregates.eligible === 0) {
    // Claimed but no eligible rows found at send time (race).
    const released = await releaseNewsletterCampaignClaimIfUnattempted(campaignId);
    await recordAdminAuditEvent({
      actor: input.actor,
      action: "newsletter_campaign.send_failed",
      area: "content",
      entityType: "NewsletterCampaign",
      entityId: campaignId,
      entityLabel: campaign.name,
      entityPath: `/admin/newsletter/campaigns/${campaignId}`,
      metadata: {
        reason: "zero_eligible_at_send",
        releasedClaim: released,
        ...aggregates,
      },
    });
    return {
      ok: false,
      code: "conflict",
      message: "No eligible newsletter recipients.",
    };
  }

  await finalizeNewsletterCampaignSent(campaignId);
  await recordAdminAuditEvent({
    actor: input.actor,
    action: "newsletter_campaign.sent",
    area: "content",
    entityType: "NewsletterCampaign",
    entityId: campaignId,
    entityLabel: campaign.name,
    entityPath: `/admin/newsletter/campaigns/${campaignId}`,
    metadata: { ...aggregates },
  });

  const message =
    aggregates.failed > 0
      ? `Sent with delivery failures (${aggregates.succeeded} succeeded, ${aggregates.failed} failed).`
      : `Sent successfully (${aggregates.succeeded} deliveries).`;

  return {
    ok: true,
    data: {
      campaignId,
      status: "sent",
      releasedClaim: false,
      message,
      ...aggregates,
    },
  };
}

export type { NewsletterCampaignRecord };
