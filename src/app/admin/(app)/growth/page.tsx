import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { GrowthOpportunitiesView } from "@/components/admin/GrowthOpportunitiesView";
import { formatAdminDateTime } from "@/lib/datetime";
import { isAdminGrowthOpportunitiesEnabled } from "@/lib/flags";
import { getAdminGrowthOpportunities } from "@/lib/growth-opportunities-server";

export const metadata: Metadata = {
  title: "Growth Opportunities",
};

export const dynamic = "force-dynamic";

export default async function AdminGrowthOpportunitiesPage() {
  if (!isAdminGrowthOpportunitiesEnabled()) notFound();

  const payload = await getAdminGrowthOpportunities();
  const generatedLabel = formatAdminDateTime(payload.generatedAt);

  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader
        title="Growth Opportunities"
        description="Evidence-based opportunities from Mesa’s existing content and search data."
        meta={
          <p>
            Read-only · recomputes from current data. Growth surfaces prioritized
            opportunities; Content Health remains the full publishing-readiness view.
          </p>
        }
        titleClassName="font-serif text-3xl text-ink"
        className="mb-0"
      />

      <GrowthOpportunitiesView
        opportunities={payload.opportunities}
        generatedLabel={generatedLabel}
      />
    </div>
  );
}
