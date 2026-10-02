import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NewsletterAdminSubnav } from "@/components/admin/NewsletterAdminSubnav";
import { NewsletterCampaignEditor } from "@/components/admin/NewsletterCampaignEditor";
import {
  canAccess,
  canComposeNewsletterCampaigns,
  canDryRunNewsletterCampaigns,
  canSendNewsletterCampaigns,
  canViewNewsletterCampaigns,
  homeForRole,
} from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { isNewsletterPersonalizationEnabled } from "@/lib/flags";
import { collectNewsletterCampaignRecipeIds } from "@/lib/newsletter-campaign-admin";
import {
  getNewsletterCampaignById,
  resolveNewsletterCampaignRecipes,
} from "@/lib/newsletter-campaign-server";
import {
  listCategoriesForCampaignPreview,
  listPublishedRecipesForCampaignPicker,
  listSeriesForCampaignPreview,
} from "@/lib/newsletter-campaign-admin-server";
import { getLatestNewsletterCampaignSendSummary } from "@/lib/newsletter-campaign-send";
import { siteUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const campaign = await getNewsletterCampaignById(id);
  return { title: campaign ? campaign.name : "Newsletter campaign" };
}

export default async function AdminNewsletterCampaignEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canViewNewsletterCampaigns(admin.role)) redirect(homeForRole(admin.role));

  const { id } = await params;
  const query = await searchParams;
  const campaign = await getNewsletterCampaignById(id);
  if (!campaign) notFound();

  const recipeIds = collectNewsletterCampaignRecipeIds(campaign.content);
  const [resolvedMap, publishedRecipes, seriesOptions, categoryOptions, sendSummary] =
    await Promise.all([
      resolveNewsletterCampaignRecipes(recipeIds, { baseUrl: siteUrl() }),
      listPublishedRecipesForCampaignPicker(),
      listSeriesForCampaignPreview(),
      listCategoriesForCampaignPreview(),
      campaign.status === "sent" || campaign.status === "sending"
        ? getLatestNewsletterCampaignSendSummary(campaign.id)
        : Promise.resolve(null),
    ]);

  const canCompose = canComposeNewsletterCampaigns(admin.role);
  const canDryRun = canDryRunNewsletterCampaigns(admin.role);
  const canSend = canSendNewsletterCampaigns(admin.role);
  const showSubscribers = canAccess(admin.role, "members");
  const personalizationLiveEnabled = isNewsletterPersonalizationEnabled();

  return (
    <div>
      <AdminPageHeader
        title={campaign.name}
        description={`Status: ${campaign.status}. Preview and dry run do not send email.`}
        documentationTopicId="newsletter"
        actions={
          <Link
            href="/admin/newsletter/campaigns"
            className="inline-flex rounded-sm border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream/40"
          >
            All campaigns
          </Link>
        }
      />

      <NewsletterAdminSubnav
        active="campaigns"
        showSubscribers={showSubscribers}
        showCampaigns
      />

      <NewsletterCampaignEditor
        campaignId={campaign.id}
        initialName={campaign.name}
        initialStatus={campaign.status}
        initialSendStartedAt={campaign.sendStartedAt?.toISOString() ?? null}
        initialSentAt={campaign.sentAt?.toISOString() ?? null}
        initialContent={campaign.content}
        resolvedRecipes={[...resolvedMap.values()]}
        publishedRecipes={publishedRecipes}
        seriesOptions={seriesOptions}
        categoryOptions={categoryOptions}
        canCompose={canCompose}
        canDryRun={canDryRun}
        canSend={canSend}
        canDelete={canCompose}
        personalizationLiveEnabled={personalizationLiveEnabled}
        sendSummary={
          sendSummary
            ? {
                action: sendSummary.action,
                createdAt: sendSummary.createdAt.toISOString(),
                eligible: sendSummary.eligible,
                attempted: sendSummary.attempted,
                succeeded: sendSummary.succeeded,
                failed: sendSummary.failed,
                personalized: sendSummary.personalized,
                fallback: sendSummary.fallback,
                skippedInvalid: sendSummary.skippedInvalid,
                personalizationEnabled: sendSummary.personalizationEnabled,
              }
            : null
        }
        errorMessage={query.error}
      />
    </div>
  );
}
