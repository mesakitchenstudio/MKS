import type { Metadata } from "next";
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
import { loadYoutubeAdminDashboard } from "@/lib/youtube-data/dashboard";
import {
  parseYoutubeDashboardFilter,
  youtubeDashboardFilterQueryValue,
} from "@/lib/youtube-data/video-format";
import { parseAnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";
import { loadYoutubeFunnelDashboard } from "@/lib/youtube-funnel/load";

export const metadata: Metadata = {
  title: "YouTube",
};

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

  const [dashboard, recipeTypes, funnel, importedSeriesCount] = await Promise.all([
    loadYoutubeAdminDashboard({ analyticsRangeDays: rangeDays }),
    canCreateRecipes
      ? db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    view === "funnel"
      ? loadYoutubeFunnelDashboard({
          analyticsRangeDays: rangeDays,
          includeDiagnostics: admin.role === "owner",
          includeEditorTracking: admin.role === "editor",
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

  const navLinkClass = (active: boolean) =>
    `inline-flex min-h-11 items-center border-b-2 px-1 pb-1 text-sm font-semibold transition-colors sm:min-h-9 ${adminFocusRing} ${
      active
        ? "border-terracotta text-ink"
        : "border-transparent text-muted hover:border-line hover:text-ink"
    }`;

  return (
    <div className="space-y-6">
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

      <header className="space-y-4">
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          YouTube
        </h1>
        <nav className="flex flex-wrap gap-5" aria-label="YouTube views">
          <Link
            href={viewHref("channel")}
            className={navLinkClass(view === "channel")}
            aria-current={view === "channel" ? "page" : undefined}
          >
            Channel
          </Link>
          <Link
            href={viewHref("funnel")}
            className={navLinkClass(view === "funnel")}
            aria-current={view === "funnel" ? "page" : undefined}
          >
            Website video
          </Link>
        </nav>
      </header>

      {view === "funnel" && funnel ? (
        <YoutubeFunnelPanel funnel={funnel} filterQuery={filterQuery || undefined} />
      ) : (
        <YoutubeDashboard
          channel={dashboard.channel}
          summary={dashboard.summary}
          coverage={dashboard.coverage}
          attention={dashboard.attention}
          videos={dashboard.videos}
          canSync={canManageYoutubeSync(admin.role)}
          canManageAnalytics={canManageYoutubeAnalytics(admin.role)}
          canCreateRecipes={canCreateRecipes}
          recipeTypes={recipeTypes}
          initialFilter={filter}
          analytics={dashboard.analytics}
          importedSeriesCount={importedSeriesCount}
          showSeriesUtility={canCreateRecipes}
        />
      )}
    </div>
  );
}
