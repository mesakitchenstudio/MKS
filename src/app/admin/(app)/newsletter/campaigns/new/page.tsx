import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NewsletterAdminSubnav } from "@/components/admin/NewsletterAdminSubnav";
import {
  canAccess,
  canComposeNewsletterCampaigns,
  homeForRole,
} from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { createNewsletterCampaignAction } from "@/app/admin/newsletter-campaign-actions";
import { NEWSLETTER_CAMPAIGN_NAME_MAX } from "@/lib/newsletter-campaign";

export const metadata: Metadata = {
  title: "New newsletter campaign",
};

export const dynamic = "force-dynamic";

export default async function AdminNewsletterCampaignNewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canComposeNewsletterCampaigns(admin.role)) redirect(homeForRole(admin.role));

  const query = await searchParams;
  const showSubscribers = canAccess(admin.role, "members");

  return (
    <div>
      <AdminPageHeader
        title="New newsletter campaign"
        description="Create a draft with an internal name, then continue in the editor."
        documentationTopicId="newsletter"
        actions={
          <Link
            href="/admin/newsletter/campaigns"
            className="inline-flex rounded-sm border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream/40"
          >
            Back to campaigns
          </Link>
        }
      />

      <NewsletterAdminSubnav
        active="campaigns"
        showSubscribers={showSubscribers}
        showCampaigns
      />

      {query.error ? (
        <p
          className="mb-4 rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}

      <form action={createNewsletterCampaignAction} className="max-w-lg space-y-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Internal name</span>
          <input
            name="name"
            required
            maxLength={NEWSLETTER_CAMPAIGN_NAME_MAX}
            className="w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            placeholder="Spring breads update"
            autoComplete="off"
          />
          <span className="text-xs text-muted">
            Required. Max {NEWSLETTER_CAMPAIGN_NAME_MAX} characters. Subject and Recipes come next.
          </span>
        </label>
        <button
          type="submit"
          className="rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-paper hover:bg-ink/90"
        >
          Create draft
        </button>
      </form>
    </div>
  );
}
