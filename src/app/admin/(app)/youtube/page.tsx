import Link from "next/link";
import { YoutubeDashboard } from "@/components/admin/YoutubeDashboard";
import { YoutubeFunnelPanel } from "@/components/admin/YoutubeFunnelPanel";
import { canAccess, canManageYoutubeAnalytics, canManageYoutubeSync } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  AdminFlashStatus,
  YOUTUBE_ANALYTICS_FLASH_PARAMS,
} from "@/lib/admin-transient-feedback";
import { adminFocusRing } from "@/lib/admin-ui";
import { summarizeYoutubeContentHealth } from "@/lib/youtube-data/health";
import { loadYoutubeAdminDashboard } from "@/lib/youtube-data/dashboard";
import {
  parseYoutubeDashboardFilter,
  youtubeDashboardFilterQueryValue,
} from "@/lib/youtube-data/video-format";
import { parseAnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";
import { loadYoutubeFunnelDashboard } from "@/lib/youtube-funnel/load";

export const dynamic = "force-dynamic";

function parseYoutubeView(raw: unknown): "channel" | "funnel" {
  return String(raw || "").trim() === "funnel" ? "funnel" : "channel";
}

export default async function AdminYoutubePage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    range?: string;
    view?: string;
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
  const view = parseYoutubeView(params.view);
  const filter = parseYoutubeDashboardFilter(params.filter);
  const filterQuery = youtubeDashboardFilterQueryValue(filter);

  const [dashboard, health, recipeTypes, funnel, importedSeriesCount] = await Promise.all([
    loadYoutubeAdminDashboard({ analyticsRangeDays: rangeDays }),
    summarizeYoutubeContentHealth(),
    canCreateRecipes
      ? db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    view === "funnel"
      ? loadYoutubeFunnelDashboard({
          analyticsRangeDays: rangeDays,
          includeDiagnostics: admin.role === "owner",
        })
      : null,
    canCreateRecipes
      ? db.series.count({ where: { youtubePlaylistId: { not: "" } } })
      : Promise.resolve(0),
  ]);

  const connectedFlash = params.analyticsConnected?.trim()
    ? `Connected YouTube Analytics as ${params.analyticsConnected.trim()}.`
    : "";
  const noticeFlash = params.analyticsNotice?.trim() || "";
  const successFlash = [connectedFlash, noticeFlash].filter(Boolean).join(" ");
  const errorFlash = params.analyticsError?.trim() || "";

  function viewHref(next: "channel" | "funnel") {
    const qs = new URLSearchParams();
    if (next === "funnel") qs.set("view", "funnel");
    if (filterQuery) qs.set("filter", filterQuery);
    if (rangeDays !== 28) qs.set("range", String(rangeDays));
    const s = qs.toString();
    return s ? `/admin/youtube?${s}` : "/admin/youtube";
  }

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

      <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-sm">
        <Link
          href={viewHref("channel")}
          className={`rounded-sm px-3 py-1.5 font-semibold transition-colors ${
            view === "channel" ? "bg-sand text-ink" : "text-muted hover:text-ink"
          } ${adminFocusRing}`}
        >
          Channel analytics
        </Link>
        <Link
          href={viewHref("funnel")}
          className={`rounded-sm px-3 py-1.5 font-semibold transition-colors ${
            view === "funnel" ? "bg-sand text-ink" : "text-muted hover:text-ink"
          } ${adminFocusRing}`}
        >
          Website funnel
        </Link>
      </div>

      {view === "funnel" && funnel ? (
        <YoutubeFunnelPanel funnel={funnel} filterQuery={filterQuery || undefined} />
      ) : (
        <>
          {canCreateRecipes ? (
            <div className="rounded-sm border border-line bg-cream/30 px-4 py-3 text-sm">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
                Playlist / Series coverage
              </p>
              <p className="mt-1 text-ink">
                Imported as Mesa Series: <span className="font-semibold">{importedSeriesCount}</span>
              </p>
              <Link href="/admin/series" className={`mt-2 inline-block font-semibold text-olive hover:underline ${adminFocusRing}`}>
                Manage Series
              </Link>
            </div>
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
            initialFilter={filter}
            analytics={dashboard.analytics}
          />
        </>
      )}
    </div>
  );
}
