/**
 * Phase 12C — Newsletter campaign server helpers (read + Recipe resolution).
 *
 * No send / Resend / Admin UI. Mutations for tests only via Prisma directly
 * or temporary create helpers without HTTP endpoints.
 */

import { getDb } from "@/lib/db";
import {
  normalizeNewsletterCampaignContent,
  normalizeNewsletterCampaignStatus,
  serializeNewsletterCampaignContent,
  type NewsletterCampaignContent,
  type ResolvedNewsletterCampaignRecipe,
} from "@/lib/newsletter-campaign";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { normalizeRecipeImageSrc } from "@/lib/recipe-images";
import { parseValues } from "@/lib/recipe-map";
import { absolutePublicUrl } from "@/lib/breadcrumb-jsonld";

export type NewsletterCampaignRecord = {
  id: string;
  name: string;
  status: string;
  content: NewsletterCampaignContent;
  contentRaw: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  sendStartedAt: Date | null;
};

function mapCampaignRow(row: {
  id: string;
  name: string;
  status: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  sendStartedAt: Date | null;
}): NewsletterCampaignRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    content: normalizeNewsletterCampaignContent(row.content),
    contentRaw: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.sentAt,
    sendStartedAt: row.sendStartedAt,
  };
}

/** Safe public image URL for email, or null. */
export function resolveNewsletterCampaignRecipeImageUrl(
  valuesImage: unknown,
  baseUrl?: string,
): string | null {
  const normalized = normalizeRecipeImageSrc(String(valuesImage ?? ""));
  if (!normalized) return null;
  if (/^(javascript|data|vbscript):/i.test(normalized)) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/")) {
    if (baseUrl) {
      const base = baseUrl.replace(/\/$/, "");
      return `${base}${normalized}`;
    }
    return absolutePublicUrl(normalized);
  }
  return null;
}

/**
 * Resolve campaign Recipe IDs with one bounded IN query (+ memberships).
 * Missing IDs are simply absent from the returned map.
 */
export async function resolveNewsletterCampaignRecipes(
  recipeIds: Iterable<string>,
  options?: { baseUrl?: string },
): Promise<Map<string, ResolvedNewsletterCampaignRecipe>> {
  const ids = [...new Set([...recipeIds].map((id) => String(id ?? "").trim()).filter(Boolean))];
  const out = new Map<string, ResolvedNewsletterCampaignRecipe>();
  if (ids.length === 0) return out;

  const db = getDb();
  const rows = await db.recipe.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      values: true,
      categories: { select: { categoryId: true } },
      seriesItems: { select: { seriesId: true } },
    },
  });

  for (const row of rows) {
    const values = parseValues(row.values);
    const dishName = typeof values.dishName === "string" ? values.dishName : "";
    const title = resolveRecipeCardTitle({ title: row.title, dishName });
    const imageUrl = resolveNewsletterCampaignRecipeImageUrl(values.image, options?.baseUrl);
    const imageAlt =
      typeof values.imageAlt === "string" && values.imageAlt.trim()
        ? values.imageAlt.trim()
        : title;

    out.set(row.id, {
      id: row.id,
      status: row.status,
      slug: row.slug,
      title,
      publishedAt: row.publishedAt,
      seriesIds: row.seriesItems.map((item) => item.seriesId).sort((a, b) => a.localeCompare(b, "en")),
      categoryIds: row.categories
        .map((item) => item.categoryId)
        .sort((a, b) => a.localeCompare(b, "en")),
      imageUrl,
      imageAlt,
    });
  }

  return out;
}

export async function getNewsletterCampaignById(
  id: string,
): Promise<NewsletterCampaignRecord | null> {
  const campaignId = String(id ?? "").trim();
  if (!campaignId) return null;
  const row = await getDb().newsletterCampaign.findUnique({ where: { id: campaignId } });
  return row ? mapCampaignRow(row) : null;
}

export async function listNewsletterCampaigns(input?: {
  take?: number;
}): Promise<NewsletterCampaignRecord[]> {
  const take = Math.min(100, Math.max(1, Math.floor(Number(input?.take) || 50)));
  const rows = await getDb().newsletterCampaign.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take,
  });
  return rows.map(mapCampaignRow);
}

/**
 * Internal create helper for foundation/tests — not an Admin action / API.
 * Always creates draft. Does not send email or touch subscribers.
 */
export async function createNewsletterCampaignDraft(input: {
  name: string;
  content?: unknown;
}): Promise<NewsletterCampaignRecord> {
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Campaign name is required.");
  const content = serializeNewsletterCampaignContent(
    normalizeNewsletterCampaignContent(input.content ?? {}),
  );
  const row = await getDb().newsletterCampaign.create({
    data: {
      name,
      status: "draft",
      content,
    },
  });
  return mapCampaignRow(row);
}

export async function updateNewsletterCampaignDraftContent(input: {
  id: string;
  name?: string;
  content?: unknown;
}): Promise<NewsletterCampaignRecord | null> {
  const id = String(input.id ?? "").trim();
  if (!id) return null;
  const existing = await getDb().newsletterCampaign.findUnique({ where: { id } });
  if (!existing) return null;
  if (normalizeNewsletterCampaignStatus(existing.status) !== "draft") {
    throw new Error("Only draft campaigns can be edited.");
  }
  const data: { name?: string; content?: string } = {};
  if (input.name != null) {
    const name = String(input.name).trim().slice(0, 120);
    if (!name) throw new Error("Campaign name is required.");
    data.name = name;
  }
  if (input.content !== undefined) {
    data.content = serializeNewsletterCampaignContent(
      normalizeNewsletterCampaignContent(input.content),
    );
  }
  const row = await getDb().newsletterCampaign.update({ where: { id }, data });
  return mapCampaignRow(row);
}
