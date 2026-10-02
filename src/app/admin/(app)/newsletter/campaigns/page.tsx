import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NewsletterAdminSubnav } from "@/components/admin/NewsletterAdminSubnav";
import { NewsletterCampaignList } from "@/components/admin/NewsletterCampaignList";
import {
  canAccess,
  canComposeNewsletterCampaigns,
  canViewNewsletterCampaigns,
  homeForRole,
} from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { listNewsletterCampaignsForAdmin } from "@/lib/newsletter-campaign-admin-server";

export const metadata: Metadata = {
  title: "Newsletter campaigns",
};

export const dynamic = "force-dynamic";

export default async function AdminNewsletterCampaignsPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canViewNewsletterCampaigns(admin.role)) redirect(homeForRole(admin.role));

  const canCompose = canComposeNewsletterCampaigns(admin.role);
  const showSubscribers = canAccess(admin.role, "members");
  const campaigns = await listNewsletterCampaignsForAdmin({ take: 50 });

  return (
    <div>
      <AdminPageHeader
        title="Newsletter campaigns"
        description="Compose draft newsletter campaigns. Sending is not available in this phase."
        documentationTopicId="newsletter"
        actions={
          canCompose ? (
            <Link
              href="/admin/newsletter/campaigns/new"
              className="inline-flex rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-paper hover:bg-ink/90"
            >
              Create campaign
            </Link>
          ) : null
        }
      />

      <NewsletterAdminSubnav
        active="campaigns"
        showSubscribers={showSubscribers}
        showCampaigns
      />

      <NewsletterCampaignList campaigns={campaigns} canCompose={canCompose} />
    </div>
  );
}
