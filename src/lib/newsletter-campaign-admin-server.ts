/**
 * Phase 12D — Newsletter campaign Admin server helpers.
 * CRUD + Recipe search + preview builders. No Resend. No send timestamps.
 */

import { getDb } from "@/lib/db";
import { recordAdminAuditEvent, type AdminAuditActor } from "@/lib/admin-audit";
import {
  assertNewsletterCampaignEditableStatus,
  collectNewsletterCampaignRecipeIds,
  validateNewsletterCampaignContentUpdate,
  validateNewsletterCampaignName,
  type NewsletterCampaignAdminListItem,
  type NewsletterCampaignMutationResult,
  type NewsletterCampaignPickerRecipe,
  type NewsletterCampaignPreviewMode,
  type NewsletterCampaignPreviewResult,
  NEWSLETTER_CAMPAIGN_PREVIEW_UNSUBSCRIBE_URL,
} from "@/lib/newsletter-campaign-admin";
import {
  buildNewsletterCampaignEmailRecipeCards,
  getNewsletterCampaignSendReadiness,
  normalizeNewsletterCampaignContent,
  selectNewsletterCampaignRecipeSelection,
  serializeNewsletterCampaignContent,
  type NewsletterCampaignContent,
  type ResolvedNewsletterCampaignRecipe,
} from "@/lib/newsletter-campaign";
import {
  createNewsletterCampaignDraft,
  getNewsletterCampaignById,
  resolveNewsletterCampaignRecipes,
  type NewsletterCampaignRecord,
} from "@/lib/newsletter-campaign-server";
import {
  buildNewsletterCampaignEmail,
  NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING,
  NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING,
} from "@/lib/newsletter-campaign-email";
import { emptyNewsletterInterestProfile } from "@/lib/newsletter-personalization";
import { isFollowableCategoryGroup } from "@/lib/member-follows";
import { siteUrl } from "@/lib/email";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { parseValues } from "@/lib/recipe-map";

export type { NewsletterCampaignPickerRecipe, NewsletterCampaignPreviewResult };

export async function listNewsletterCampaignsForAdmin(input?: {
  take?: number;
}): Promise<NewsletterCampaignAdminListItem[]> {
  const take = Math.min(100, Math.max(1, Math.floor(Number(input?.take) || 50)));
  const rows = await getDb().newsletterCampaign.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      name: true,
      status: true,
      content: true,
      updatedAt: true,
      createdAt: true,
      sentAt: true,
    },
  });

  return rows.map((row) => {
    const content = normalizeNewsletterCampaignContent(row.content);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      subject: content.subject,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      ready: null,
    };
  });
}

export async function listPublishedRecipesForCampaignPicker(): Promise<
  NewsletterCampaignPickerRecipe[]
> {
  const rows = await getDb().recipe.findMany({
    where: { status: "published" },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: 200,
    select: { id: true, title: true, slug: true, status: true, values: true },
  });
  return rows.map((row) => {
    const values = parseValues(row.values);
    const dishName = typeof values.dishName === "string" ? values.dishName : "";
    return {
      id: row.id,
      title: resolveRecipeCardTitle({ title: row.title, dishName }),
      slug: row.slug,
      status: row.status,
    };
  });
}

export async function createNewsletterCampaignForAdmin(input: {
  name: string;
  actor: AdminAuditActor;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignRecord>> {
  const nameResult = validateNewsletterCampaignName(input.name);
  if (!nameResult.ok) return nameResult;

  const created = await createNewsletterCampaignDraft({ name: nameResult.data });
  await recordAdminAuditEvent({
    actor: input.actor,
    action: "newsletter_campaign.created",
    area: "content",
    entityType: "NewsletterCampaign",
    entityId: created.id,
    entityLabel: created.name,
    entityPath: `/admin/newsletter/campaigns/${created.id}`,
    metadata: { status: created.status },
  });
  return { ok: true, data: created };
}

export async function updateNewsletterCampaignForAdmin(input: {
  id: string;
  name?: string;
  content?: unknown;
  actor: AdminAuditActor;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignRecord>> {
  const id = String(input.id ?? "").trim();
  if (!id) return { ok: false, code: "not_found", message: "Campaign not found." };

  const existing = await getNewsletterCampaignById(id);
  if (!existing) return { ok: false, code: "not_found", message: "Campaign not found." };

  const editable = assertNewsletterCampaignEditableStatus(existing.status);
  if (!editable.ok) return editable;

  let nextName = existing.name;
  if (input.name !== undefined) {
    const nameResult = validateNewsletterCampaignName(input.name);
    if (!nameResult.ok) return nameResult;
    nextName = nameResult.data;
  }

  let nextContent = existing.content;
  if (input.content !== undefined) {
    const proposed = normalizeNewsletterCampaignContent(input.content);
    const resolveIds = collectNewsletterCampaignRecipeIds({
      ...proposed,
      featuredRecipeId: proposed.featuredRecipeId ?? existing.content.featuredRecipeId,
      defaultRecipeIds: [
        ...proposed.defaultRecipeIds,
        ...existing.content.defaultRecipeIds,
      ],
      candidateRecipeIds: [
        ...proposed.candidateRecipeIds,
        ...existing.content.candidateRecipeIds,
      ],
    });
    const resolved = await resolveNewsletterCampaignRecipes(resolveIds);
    const validated = validateNewsletterCampaignContentUpdate({
      previous: existing.content,
      nextRaw: input.content,
      resolved,
    });
    if (!validated.ok) return validated;
    nextContent = validated.data;
  }

  // Only name + content — never touch status / sentAt / sendStartedAt.
  const row = await getDb().newsletterCampaign.update({
    where: { id },
    data: {
      name: nextName,
      content: serializeNewsletterCampaignContent(nextContent),
    },
  });

  await recordAdminAuditEvent({
    actor: input.actor,
    action: "newsletter_campaign.updated",
    area: "content",
    entityType: "NewsletterCampaign",
    entityId: row.id,
    entityLabel: row.name,
    entityPath: `/admin/newsletter/campaigns/${row.id}`,
    metadata: { status: row.status },
  });

  return {
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      status: row.status,
      content: normalizeNewsletterCampaignContent(row.content),
      contentRaw: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sentAt: row.sentAt,
      sendStartedAt: row.sendStartedAt,
    },
  };
}

export async function deleteNewsletterCampaignForAdmin(input: {
  id: string;
  actor: AdminAuditActor;
}): Promise<NewsletterCampaignMutationResult<{ id: string; name: string }>> {
  const id = String(input.id ?? "").trim();
  if (!id) return { ok: false, code: "not_found", message: "Campaign not found." };

  const existing = await getNewsletterCampaignById(id);
  if (!existing) return { ok: false, code: "not_found", message: "Campaign not found." };

  const editable = assertNewsletterCampaignEditableStatus(existing.status);
  if (!editable.ok) return editable;

  await getDb().newsletterCampaign.delete({ where: { id } });
  await recordAdminAuditEvent({
    actor: input.actor,
    action: "newsletter_campaign.deleted",
    area: "content",
    entityType: "NewsletterCampaign",
    entityId: existing.id,
    entityLabel: existing.name,
    entityPath: `/admin/newsletter/campaigns`,
    metadata: { status: existing.status },
  });
  return { ok: true, data: { id: existing.id, name: existing.name } };
}

export async function buildNewsletterCampaignAdminPreview(input: {
  campaignId: string;
  mode: NewsletterCampaignPreviewMode;
  seriesId?: string | null;
  categoryId?: string | null;
  /** Explicit simulation — Admin may preview personalization before Production gate ON. */
  personalizationEnabled: boolean;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignPreviewResult>> {
  const campaign = await getNewsletterCampaignById(input.campaignId);
  if (!campaign) return { ok: false, code: "not_found", message: "Campaign not found." };

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

  let profile = emptyNewsletterInterestProfile(null);
  const explanation: string[] = [];

  if (input.mode === "series" && input.seriesId) {
    const series = await getDb().series.findUnique({
      where: { id: input.seriesId },
      select: { id: true, title: true, isPublished: true },
    });
    if (series?.isPublished) {
      profile = {
        userId: null,
        followedSeriesIds: [series.id],
        followedCategoryIds: [],
      };
      explanation.push(`Personalized using Series: ${series.title}`);
    } else {
      explanation.push("Series not found or unpublished — showing general fallback.");
    }
  } else if (input.mode === "category" && input.categoryId) {
    const category = await getDb().category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, name: true, group: true },
    });
    if (category && isFollowableCategoryGroup(category.group)) {
      profile = {
        userId: null,
        followedSeriesIds: [],
        followedCategoryIds: [category.id],
      };
      explanation.push(`Personalized using Category: ${category.name}`);
    } else {
      explanation.push("Category not followable — showing general fallback.");
    }
  } else {
    explanation.push("General editorial preview (no personalization signals).");
  }

  const personalize =
    Boolean(input.personalizationEnabled) && input.mode !== "general";

  const selection = selectNewsletterCampaignRecipeSelection({
    content: campaign.content,
    resolvedRecipes: resolved,
    profile,
    personalizationEnabled: personalize,
  });

  const baseUrl = siteUrl().replace(/\/$/, "");
  const featuredCards = selection.featured
    ? buildNewsletterCampaignEmailRecipeCards({
        baseUrl,
        recipes: [selection.featured],
      })
    : [];
  const blockRecipes = selection.block.items
    .map((item) => resolved.get(item.recipeId))
    .filter((row): row is ResolvedNewsletterCampaignRecipe => Boolean(row));
  const blockCards = buildNewsletterCampaignEmailRecipeCards({
    baseUrl,
    recipes: blockRecipes,
  });

  const email = buildNewsletterCampaignEmail({
    subject: campaign.content.subject || campaign.name,
    preheader: campaign.content.preheader,
    intro: campaign.content.intro,
    featured: featuredCards[0] ?? null,
    blockRecipes: blockCards,
    blockMode: selection.block.mode,
    unsubscribeUrl: NEWSLETTER_CAMPAIGN_PREVIEW_UNSUBSCRIBE_URL,
  });

  return {
    ok: true,
    data: {
      subject: email.subject,
      preheader: campaign.content.preheader,
      html: email.html,
      text: email.text,
      blockMode: selection.block.mode,
      blockHeading:
        selection.block.mode === "personalized"
          ? NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING
          : NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING,
      explanation,
      readinessReady: readiness.ready,
      readinessIssues: readiness.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
      featuredTitle: selection.featured?.title ?? null,
    },
  };
}

export async function listSeriesForCampaignPreview() {
  return getDb().series.findMany({
    where: { isPublished: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: 100,
    select: { id: true, title: true },
  });
}

export async function listCategoriesForCampaignPreview() {
  const rows = await getDb().category.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 200,
    select: { id: true, name: true, group: true },
  });
  return rows.filter((row) => isFollowableCategoryGroup(row.group));
}

export type { NewsletterCampaignContent };
