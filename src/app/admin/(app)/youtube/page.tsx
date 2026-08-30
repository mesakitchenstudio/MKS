import { YoutubeDashboard } from "@/components/admin/YoutubeDashboard";
import { canAccess, canManageYoutubeAnalytics, canManageYoutubeSync } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { summarizeYoutubeContentHealth } from "@/lib/youtube-data/health";
import { loadYoutubeAdminDashboard } from "@/lib/youtube-data/dashboard";
import { parseYoutubeDashboardFilter } from "@/lib/youtube-data/video-format";
import { parseAnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

export const dynamic = "force-dynamic";

export default async function AdminYoutubePage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    range?: string;
    analyticsError?: string;
    analyticsConnected?: string;
    analyticsNotice?: string;
  }>;
}) {
  const admin = await requireAccess("youtube");
  const params = await searchParams;
  const db = getDb();
  const canCreateRecipes = canAccess(admin.role, "content");
  const rangeDays = parseAnalyticsRangeDays(params.range);
  const [dashboard, health, recipeTypes] = await Promise.all([
    loadYoutubeAdminDashboard({ analyticsRangeDays: rangeDays }),
    summarizeYoutubeContentHealth(),
    canCreateRecipes
      ? db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return (
    <YoutubeDashboard
      channel={dashboard.channel}
      summary={dashboard.summary}
      videos={dashboard.videos}
      healthSummary={health}
      canSync={canManageYoutubeSync(admin.role)}
      canManageAnalytics={canManageYoutubeAnalytics(admin.role)}
      canCreateRecipes={canCreateRecipes}
      recipeTypes={recipeTypes}
      initialFilter={parseYoutubeDashboardFilter(params.filter)}
      analytics={dashboard.analytics}
      analyticsError={params.analyticsError || ""}
      analyticsNotice={
        params.analyticsConnected
          ? `Connected YouTube Analytics as ${params.analyticsConnected}.`
          : params.analyticsNotice || ""
      }
    />
  );
}
