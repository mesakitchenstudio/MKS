"use server";

/**
 * Phase 12D/12E — Newsletter campaign Admin server actions.
 * Audience send + Owner test send are Owner-only. Provider injectable via libs.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canComposeNewsletterCampaigns,
  canDryRunNewsletterCampaigns,
  canSendNewsletterCampaigns,
  canViewNewsletterCampaigns,
  homeForRole,
} from "@/lib/admin-access";
import { actorFromAdminSession } from "@/lib/admin-audit";
import { getAdminSession } from "@/lib/auth";
import {
  type NewsletterCampaignDryRunResult,
  type NewsletterCampaignMutationResult,
  type NewsletterCampaignPreviewMode,
  type NewsletterCampaignPreviewResult,
} from "@/lib/newsletter-campaign-admin";
import {
  buildNewsletterCampaignAdminPreview,
  createNewsletterCampaignForAdmin,
  deleteNewsletterCampaignForAdmin,
  updateNewsletterCampaignForAdmin,
} from "@/lib/newsletter-campaign-admin-server";
import { runNewsletterCampaignDryRun } from "@/lib/newsletter-campaign-dry-run";
import {
  getNewsletterCampaignSendConfirmInfo,
  sendNewsletterCampaignTestEmail,
  sendNewsletterCampaignToAudience,
  type NewsletterCampaignAudienceSendResult,
  type NewsletterCampaignSendConfirmInfo,
  type NewsletterCampaignTestSendResult,
} from "@/lib/newsletter-campaign-send";

async function requireComposeActor() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canComposeNewsletterCampaigns(admin.role)) redirect(homeForRole(admin.role));
  return admin;
}

function auditActorFromSession(admin: {
  id: string;
  name: string;
  email: string;
  role: string;
}) {
  return actorFromAdminSession(admin)!;
}

async function requireViewActor() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canViewNewsletterCampaigns(admin.role)) redirect(homeForRole(admin.role));
  return admin;
}

async function requireDryRunActor() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canDryRunNewsletterCampaigns(admin.role)) {
    return null;
  }
  return admin;
}

async function requireSendActor() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canSendNewsletterCampaigns(admin.role)) {
    return null;
  }
  return admin;
}

export type NewsletterCampaignActionState = {
  ok: boolean;
  message?: string;
  code?: string;
};

export async function createNewsletterCampaignAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireComposeActor();
  const name = String(formData.get("name") ?? "");
  const result = await createNewsletterCampaignForAdmin({
    name,
    actor: auditActorFromSession(admin),
  });
  if (!result.ok) {
    redirect(
      `/admin/newsletter/campaigns/new?error=${encodeURIComponent(result.message)}`,
    );
  }
  revalidatePath("/admin/newsletter/campaigns");
  redirect(`/admin/newsletter/campaigns/${result.data.id}`);
}

export async function updateNewsletterCampaignAction(input: {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  intro: string;
  featuredRecipeId: string | null;
  defaultRecipeIds: string[];
  candidateRecipeIds: string[];
}): Promise<NewsletterCampaignMutationResult<{ id: string }>> {
  const admin = await requireComposeActor();
  const result = await updateNewsletterCampaignForAdmin({
    id: input.id,
    name: input.name,
    content: {
      subject: input.subject,
      preheader: input.preheader,
      intro: input.intro,
      featuredRecipeId: input.featuredRecipeId,
      defaultRecipeIds: input.defaultRecipeIds,
      candidateRecipeIds: input.candidateRecipeIds,
    },
    actor: auditActorFromSession(admin),
  });
  if (!result.ok) return result;
  revalidatePath("/admin/newsletter/campaigns");
  revalidatePath(`/admin/newsletter/campaigns/${result.data.id}`);
  return { ok: true, data: { id: result.data.id } };
}

export async function deleteNewsletterCampaignAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireComposeActor();
  const id = String(formData.get("id") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "delete") {
    redirect(
      `/admin/newsletter/campaigns/${encodeURIComponent(id)}?error=${encodeURIComponent("Confirm deletion by typing delete.")}`,
    );
  }
  const result = await deleteNewsletterCampaignForAdmin({
    id,
    actor: auditActorFromSession(admin),
  });
  if (!result.ok) {
    redirect(
      `/admin/newsletter/campaigns/${encodeURIComponent(id)}?error=${encodeURIComponent(result.message)}`,
    );
  }
  revalidatePath("/admin/newsletter/campaigns");
  redirect("/admin/newsletter/campaigns");
}

export async function previewNewsletterCampaignAction(input: {
  campaignId: string;
  mode: NewsletterCampaignPreviewMode;
  seriesId?: string | null;
  categoryId?: string | null;
  personalizationEnabled: boolean;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignPreviewResult>> {
  await requireViewActor();
  return buildNewsletterCampaignAdminPreview({
    campaignId: input.campaignId,
    mode: input.mode,
    seriesId: input.seriesId,
    categoryId: input.categoryId,
    personalizationEnabled: input.personalizationEnabled,
  });
}

export async function dryRunNewsletterCampaignAction(input: {
  campaignId: string;
  personalizationEnabled: boolean;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignDryRunResult>> {
  const admin = await requireDryRunActor();
  if (!admin) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Dry run requires Owner or Audience access.",
    };
  }
  return runNewsletterCampaignDryRun({
    campaignId: input.campaignId,
    personalizationEnabled: input.personalizationEnabled,
  });
}

export async function getNewsletterCampaignSendConfirmInfoAction(input: {
  campaignId: string;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignSendConfirmInfo>> {
  const admin = await requireSendActor();
  if (!admin) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Send confirmation requires Owner access.",
    };
  }
  return getNewsletterCampaignSendConfirmInfo(input.campaignId);
}

export async function testSendNewsletterCampaignAction(input: {
  campaignId: string;
  mode: NewsletterCampaignPreviewMode;
  seriesId?: string | null;
  categoryId?: string | null;
  personalizationSimulation: boolean;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignTestSendResult>> {
  const admin = await requireSendActor();
  if (!admin) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Test send requires Owner access.",
    };
  }
  const result = await sendNewsletterCampaignTestEmail({
    campaignId: input.campaignId,
    ownerEmail: admin.email,
    actor: auditActorFromSession(admin),
    mode: input.mode,
    seriesId: input.seriesId,
    categoryId: input.categoryId,
    personalizationSimulation: input.personalizationSimulation,
  });
  if (result.ok) {
    revalidatePath(`/admin/newsletter/campaigns/${input.campaignId}`);
  }
  return result;
}

export async function sendNewsletterCampaignAction(input: {
  campaignId: string;
  /** Must be true from explicit confirmation dialog. */
  confirmed: boolean;
}): Promise<NewsletterCampaignMutationResult<NewsletterCampaignAudienceSendResult>> {
  const admin = await requireSendActor();
  if (!admin) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Audience send requires Owner access.",
    };
  }
  if (!input.confirmed) {
    return {
      ok: false,
      code: "invalid_content",
      message: "Confirm send before delivering to subscribers.",
    };
  }
  const result = await sendNewsletterCampaignToAudience({
    campaignId: input.campaignId,
    actor: auditActorFromSession(admin),
  });
  revalidatePath("/admin/newsletter/campaigns");
  revalidatePath(`/admin/newsletter/campaigns/${input.campaignId}`);
  return result;
}
