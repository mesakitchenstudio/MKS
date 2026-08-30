import { YoutubeDashboard } from "@/components/admin/YoutubeDashboard";
import { canAccess, canManageYoutubeAnalytics, canManageYoutubeSync } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  AdminFlashStatus,
  YOUTUBE_ANALYTICS_FLASH_PARAMS,
} from "@/lib/admin-transient-feedback";
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

  const connectedFlash = params.analyticsConnected?.trim()
    ? `Connected YouTube Analytics as ${params.analyticsConnected.trim()}.`
    : "";
  const noticeFlash = params.analyticsNotice?.trim() || "";
  const successFlash = [connectedFlash, noticeFlash].filter(Boolean).join(" ");
  const errorFlash = params.analyticsError?.trim() || "";

  return (
    <div className="space-y-4">
      {successFlash ? (
        <AdminFlashStatus
          active
          clearParams={YOUTUBE_ANALYTICS_FLASH_PARAMS}
          className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
        >
          {successFlash}
        </AdminFlashStatus>
      ) : null}
      {errorFlash ? (
        <AdminFlashStatus
          active
          clearParams={YOUTUBE_ANALYTICS_FLASH_PARAMS}
          className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta"
        >
          {errorFlash}
        </AdminFlashStatus>
      ) : null}
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
      />
    </div>
  );
}
