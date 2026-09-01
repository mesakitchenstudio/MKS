"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  disconnectYoutubeAnalyticsAction,
  syncYoutubeAction,
  syncYoutubeAnalyticsAction,
} from "@/app/admin/actions";
import {
  filterCatalogVideos,
  searchCatalogVideos,
  sortCatalogVideos,
  type CatalogVideoSortKey,
  type CatalogVideoSortDirection,
} from "@/lib/youtube-data/catalog-filters";
import type { AttentionQueueItem } from "@/lib/youtube-data/dashboard";
import type { RecipeCoverageStats, VideoCoverageStats } from "@/lib/youtube-data/coverage";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";
import { YOUTUBE_ANALYTICS_RETENTION_FOOTNOTE } from "@/lib/youtube-analytics/metric-copy";
import {
  parseYoutubeDashboardFilter,
  youtubeDashboardFilterQueryValue,
  type YoutubeDashboardVideoFilter,
} from "@/lib/youtube-data/video-format";
import type { AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";
import { ANALYTICS_RANGE_DAYS } from "@/lib/youtube-analytics/ranges";
import { formatAdminDateTime } from "@/lib/datetime";
import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";

type ChannelSummary = {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  subscriberCount: string;
  viewCount: string;
  videoCount: string;
  hiddenSubscriberCount: boolean;
  lastSyncedAt: string;
  lastSyncStatus: string;
  lastSyncError: string;
  trendViews7d: string | null;
  trendSubscribers7d: string | null;
  trendFromDate: string | null;
  trendToDate: string | null;
};

type VideoRow = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  publishedAtSort: number;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  views7d: string;
  format: YouTubeVideoFormat;
  formatLabel: string;
  recipe: { id: string; slug: string; title: string } | null;
  possibleMatch: { id: string; slug: string; title: string } | null;
  relationship: string;
  contentHealth: string;
  hasMetadataIssue: boolean;
  status: string;
  analytics?: {
    periodViews: string;
    watchTime: string;
    averageViewDuration: string;
    averageViewPercentage: string;
    subscribersGained: string;
    hasData: boolean;
  };
  periodViewsSort: number;
  subscribersGainedSort: number;
  watchTimeSort: number;
};

type AnalyticsConnection = {
  connected: boolean;
  status: string;
  channelId: string;
  channelTitle: string;
  googleAccountEmail: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string;
  videoMetricsStatus?: string;
  videoMetricsError?: string;
  scopesSufficient?: boolean;
};

type AnalyticsSummary = {
  connection: AnalyticsConnection;
  rangeDays: AnalyticsRangeDays;
  channel: {
    views: string;
    watchTime: string;
    averageViewDuration: string;
    averageViewPercentage: string;
    subscribersGained: string;
    subscribersLost: string;
    subscriberGrowth: string;
    shares: string;
  };
  videoMetricsNotice?: string;
};

type RecipeTypeOption = { id: string; name: string };

type RowPhase = "idle" | "detecting" | "confirm" | "creating" | "analyzing" | "opening" | "linking" | "error";

type ConfirmState = {
  videoId: string;
  confidence: "MEDIUM" | "LOW";
  typeId: string;
  typeName?: string;
  message?: string;
  reasoning?: string;
};

const FILTER_OPTIONS: { value: YoutubeDashboardVideoFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "long", label: "Long" },
  { value: "shorts", label: "Shorts" },
  { value: "opportunities", label: "Opportunities" },
  { value: "needs", label: "Needs recipe" },
  { value: "missing-chapters", label: "Missing chapters" },
  { value: "linked", label: "Linked" },
  { value: "metadata", label: "Metadata issues" },
];

const SORT_OPTIONS: { value: CatalogVideoSortKey; label: string }[] = [
  { value: "performance", label: "Performance" },
  { value: "subscribersGained", label: "Subscribers gained" },
  { value: "periodViews", label: "Views" },
  { value: "watchTime", label: "Watch time" },
  { value: "publishedAt", label: "Newest" },
  { value: "title", label: "Title" },
];

const compactLinkBtn =
  "inline-flex min-h-[44px] items-center rounded-sm px-1 text-xs font-semibold text-terracotta transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-50";

const secondaryBtn =
  "inline-flex min-h-[44px] items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

function relationshipClass(value: string) {
  if (value === "Linked") return "text-olive";
  if (value === "Possible match") return "text-terracotta";
  return "text-muted";
}

function contentHealthClass(value: string) {
  if (value === "Chapters OK" || value === "—") return "text-muted";
  return "text-terracotta";
}

function rowStatusLabel(phase: RowPhase, error?: string) {
  switch (phase) {
    case "detecting":
      return "Detecting type…";
    case "confirm":
      return "Confirm type…";
    case "creating":
      return "Creating recipe…";
    case "analyzing":
      return "Analyzing video…";
    case "opening":
      return "Opening recipe…";
    case "linking":
      return "Linking recipe…";
    case "error":
      return error || "Something went wrong.";
    default:
      return null;
  }
}

export function YoutubeDashboard({
  channel,
  summary,
  coverage,
  attention,
  videos: initialVideos,
  canSync,
  canManageAnalytics = false,
  canCreateRecipes = false,
  recipeTypes = [],
  initialFilter = "all",
  analytics,
  importedSeriesCount = 0,
  showSeriesUtility = false,
}: {
  channel: ChannelSummary | null;
  summary: {
    linkedVideos: number;
    videosWithoutRecipes: number;
    recipesWithVideo: number;
    recipesWithoutVideo: number;
    longVideos?: number;
    shorts?: number;
    unknownFormat?: number;
    catalogMedianPeriodViews?: number;
  };
  coverage: { video: VideoCoverageStats; recipe: RecipeCoverageStats };
  attention: { top: AttentionQueueItem[]; all: AttentionQueueItem[]; total: number };
  videos: VideoRow[];
  canSync: boolean;
  canManageAnalytics?: boolean;
  canCreateRecipes?: boolean;
  recipeTypes?: RecipeTypeOption[];
  initialFilter?: YoutubeDashboardVideoFilter | string;
  analytics: AnalyticsSummary;
  importedSeriesCount?: number;
  showSeriesUtility?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [analyticsPending, startAnalyticsTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [analyticsMessage, setAnalyticsMessage] = useState("");
  const [sessionAnalyticsAlert, setSessionAnalyticsAlert] = useState("");
  const analyticsAlert = sessionAnalyticsAlert || analytics.connection.lastError;
  const [reviewAllOpen, setReviewAllOpen] = useState(false);
  const [videoOverrides, setVideoOverrides] = useState<Record<string, Partial<VideoRow>>>({});
  const filter = parseYoutubeDashboardFilter(initialFilter);
  const videos = useMemo(
    () =>
      initialVideos.map((video) => ({
        ...video,
        ...videoOverrides[video.videoId],
      })),
    [initialVideos, videoOverrides],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<CatalogVideoSortKey>("performance");
  const [sortDirection, setSortDirection] = useState<CatalogVideoSortDirection>("desc");
  const [rowPhase, setRowPhase] = useState<Record<string, RowPhase>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function updateFilter(next: YoutubeDashboardVideoFilter) {
    const params = new URLSearchParams();
    const query = youtubeDashboardFilterQueryValue(next);
    if (query) params.set("filter", query);
    if (analytics.rangeDays !== 28) params.set("range", String(analytics.rangeDays));
    const qs = params.toString();
    router.replace(qs ? `/admin/youtube?${qs}` : "/admin/youtube", { scroll: false });
  }

  function updateRange(days: AnalyticsRangeDays) {
    const params = new URLSearchParams();
    const query = youtubeDashboardFilterQueryValue(filter);
    if (query) params.set("filter", query);
    if (days !== 28) params.set("range", String(days));
    const qs = params.toString();
    router.replace(qs ? `/admin/youtube?${qs}` : "/admin/youtube", { scroll: false });
  }

  const catalogVideos = sortCatalogVideos(
    searchCatalogVideos(
      filterCatalogVideos(videos, filter, {
        catalogMedianPeriodViews: summary.catalogMedianPeriodViews ?? 0,
      }),
      searchQuery,
    ),
    sortKey,
    sortDirection,
  );

  function setPhase(videoId: string, phase: RowPhase, error?: string) {
    setRowPhase((current) => ({ ...current, [videoId]: phase }));
    if (error) {
      setRowError((current) => ({ ...current, [videoId]: error }));
    } else {
      setRowError((current) => {
        const next = { ...current };
        delete next[videoId];
        return next;
      });
    }
  }

  function markLinked(
    videoId: string,
    recipe: { id: string; slug: string; title: string },
  ) {
    setVideoOverrides((current) => ({
      ...current,
      [videoId]: {
        recipe,
        possibleMatch: null,
        relationship: "Linked",
      },
    }));
  }

  function onSync() {
    setSyncMessage("");
    setSyncError("");
    startTransition(async () => {
      const result = await syncYoutubeAction();
      if (result.ok) {
        setSyncMessage(
          `Refreshed ${result.videosSynced} videos${result.snapshotCreated ? " and recorded a snapshot" : ""}. Recipe content was not changed.`,
        );
        router.refresh();
      } else {
        setSyncError(result.error || "YouTube sync failed.");
      }
    });
  }

  function onRefreshAnalytics() {
    setAnalyticsMessage("");
    setSessionAnalyticsAlert("");
    startAnalyticsTransition(async () => {
      const result = await syncYoutubeAnalyticsAction();
      if (result.ok) {
        if (result.videoMetricsStatus === "API_ERROR") {
          setSessionAnalyticsAlert(
            "Per-video YouTube Analytics could not be loaded. Public YouTube data is still available.",
          );
          setAnalyticsMessage(`Channel analytics refreshed (${result.channelDays} channel days).`);
        } else {
          setAnalyticsMessage(
            `Analytics refreshed (${result.channelDays} channel days, ${result.videoDays} video rows).`,
          );
        }
        router.refresh();
      } else {
        setSessionAnalyticsAlert(result.error || "YouTube Analytics refresh failed.");
      }
    });
  }

  function onDisconnectAnalytics() {
    if (
      !window.confirm(
        "Disconnect YouTube Analytics from Mesa? Public YouTube data sync will keep working.",
      )
    ) {
      return;
    }
    setAnalyticsMessage("");
    setSessionAnalyticsAlert("");
    startAnalyticsTransition(async () => {
      const result = await disconnectYoutubeAnalyticsAction();
      if (result.ok) {
        setAnalyticsMessage("YouTube Analytics disconnected.");
        router.refresh();
      } else {
        setSessionAnalyticsAlert(result.error || "Could not disconnect Analytics.");
      }
    });
  }

  async function linkRecipe(videoId: string, recipeId: string, recipeTitle: string, recipeSlug: string) {
    setPhase(videoId, "linking");
    try {
      const response = await fetch("/api/admin/youtube/link-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, recipeId }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        recipeId?: string;
        recipeTitle?: string;
        recipeSlug?: string;
      };
      if (!response.ok || !data.ok || !data.recipeId) {
        setPhase(videoId, "error", data.message || "Could not link recipe.");
        return;
      }
      markLinked(videoId, {
        id: data.recipeId,
        slug: data.recipeSlug || recipeSlug,
        title: data.recipeTitle || recipeTitle,
      });
      setPhase(videoId, "idle");
      router.refresh();
    } catch {
      setPhase(videoId, "error", "Could not link recipe.");
    }
  }

  async function createWithType(
    videoId: string,
    typeId: string,
    typeSource: "ai" | "manual",
    typeConfidence: "HIGH" | "MEDIUM" | "LOW",
  ) {
    setConfirm(null);
    setPhase(videoId, "creating");
    try {
      setPhase(videoId, "analyzing");
      const response = await fetch("/api/admin/youtube/create-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "create", videoId, typeId, typeSource, typeConfidence }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        recipeId?: string;
        recipeTitle?: string;
        recipeSlug?: string;
        analysisOk?: boolean;
        analysisMessage?: string;
        message?: string;
      };
      if (!response.ok || !data.ok || !data.recipeId) {
        setPhase(videoId, "error", data.message || "Could not create recipe.");
        return;
      }
      markLinked(videoId, {
        id: data.recipeId,
        slug: data.recipeSlug || "",
        title: data.recipeTitle || "Recipe",
      });
      setPhase(videoId, "opening");
      const params = new URLSearchParams();
      if (data.analysisOk === false) {
        params.set(
          "aiNotice",
          data.analysisMessage ||
            "Draft created, but AI analysis could not be completed. You can regenerate the analysis or edit the recipe manually.",
        );
      }
      const qs = params.toString();
      router.push(`/admin/recipes/${data.recipeId}${qs ? `?${qs}` : ""}`);
    } catch {
      setPhase(videoId, "error", "Could not create recipe.");
    }
  }

  async function startCreate(videoId: string) {
    if (!canCreateRecipes) return;
    if (
      rowPhase[videoId] &&
      rowPhase[videoId] !== "idle" &&
      rowPhase[videoId] !== "error" &&
      rowPhase[videoId] !== "confirm"
    ) {
      return;
    }
    setPhase(videoId, "detecting");
    try {
      const response = await fetch("/api/admin/youtube/create-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "classify", videoId }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        alreadyLinked?: boolean;
        recipeId?: string;
        recipeTitle?: string;
        recipeSlug?: string;
        confidence?: "HIGH" | "MEDIUM" | "LOW";
        recipeTypeId?: string | null;
        recipeTypeName?: string | null;
        reasoning?: string | null;
        message?: string;
      };
      if (data.alreadyLinked && data.recipeId) {
        markLinked(videoId, {
          id: data.recipeId,
          slug: data.recipeSlug || "",
          title: data.recipeTitle || "Recipe",
        });
        setPhase(videoId, "opening");
        router.push(`/admin/recipes/${data.recipeId}`);
        return;
      }
      if (!response.ok || !data.ok) {
        setPhase(videoId, "error", data.message || "Could not detect recipe type.");
        return;
      }
      if (data.confidence === "HIGH" && data.recipeTypeId) {
        await createWithType(videoId, data.recipeTypeId, "ai", "HIGH");
        return;
      }
      setConfirm({
        videoId,
        confidence: data.confidence === "MEDIUM" ? "MEDIUM" : "LOW",
        typeId: data.recipeTypeId || "",
        typeName: data.recipeTypeName || undefined,
        message: data.message,
        reasoning: data.reasoning || undefined,
      });
      setPhase(videoId, "confirm");
    } catch {
      setPhase(videoId, "error", "Could not detect recipe type.");
    }
  }

  function selectSort(key: CatalogVideoSortKey) {
    if (key === "performance") {
      setSortKey("performance");
      setSortDirection("desc");
      return;
    }
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "title" ? "asc" : "desc");
    }
  }

  function renderRecipeActions(video: VideoRow) {
    const phase = rowPhase[video.videoId] || "idle";
    const busy = phase !== "idle" && phase !== "error";
    const statusLabel = rowStatusLabel(phase, rowError[video.videoId]);

    if (video.recipe) {
      return (
        <Link href={`/admin/recipes/${video.recipe.id}`} className={`line-clamp-2 ${adminLinkClass}`}>
          {video.recipe.title}
        </Link>
      );
    }

    if (busy) {
      return (
        <p className="text-xs text-muted" role="status">
          {statusLabel || "Working…"}
        </p>
      );
    }

    if (!canCreateRecipes) {
      return <span className="text-muted">Unlinked</span>;
    }

    return (
      <div className="space-y-1">
        {video.possibleMatch ? (
          <p className="text-xs text-muted">
            Possible match:{" "}
            <span className="font-semibold text-ink">{video.possibleMatch.title}</span>
          </p>
        ) : null}
        {phase === "error" && rowError[video.videoId] ? (
          <p className="text-xs text-terracotta" role="alert">
            {rowError[video.videoId]}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {video.possibleMatch ? (
            <button
              type="button"
              className={compactLinkBtn}
              disabled={busy}
              onClick={() =>
                void linkRecipe(
                  video.videoId,
                  video.possibleMatch!.id,
                  video.possibleMatch!.title,
                  video.possibleMatch!.slug,
                )
              }
            >
              Link recipe
            </button>
          ) : null}
          <button
            type="button"
            className={compactLinkBtn}
            disabled={busy}
            onClick={() => void startCreate(video.videoId)}
          >
            {video.possibleMatch ? "Create new" : "+ Create recipe"}
          </button>
        </div>
      </div>
    );
  }

  const periodSuffix = `${analytics.rangeDays}d`;
  const analyticsConnected = analytics.connection.connected;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">YouTube</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Operational channel dashboard — performance, catalog coverage, and Mesa recipe relationships.
        </p>
      </div>

      {syncMessage ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          {syncMessage}
        </p>
      ) : null}
      {syncError ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {syncError}
        </p>
      ) : null}
      {analyticsMessage ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          {analyticsMessage}
        </p>
      ) : null}
      {analyticsAlert ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {analyticsAlert}
        </p>
      ) : null}
      {!analyticsAlert && analytics.videoMetricsNotice ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {analytics.videoMetricsNotice}
        </p>
      ) : null}

      <FreshnessBar
        analytics={analytics}
        channel={channel}
        canSync={canSync}
        canManageAnalytics={canManageAnalytics}
        analyticsPending={analyticsPending}
        dataPending={pending}
        onSync={onSync}
        onRefreshAnalytics={onRefreshAnalytics}
        onDisconnectAnalytics={onDisconnectAnalytics}
      />

      <NeedsAttentionSection
        items={attention.top}
        total={attention.total}
        allItems={attention.all}
        reviewAllOpen={reviewAllOpen}
        onToggleReviewAll={() => setReviewAllOpen((open) => !open)}
        onFilter={(target) => updateFilter(parseYoutubeDashboardFilter(target))}
        canCreateRecipes={canCreateRecipes}
        onLink={(videoId, recipeId, title, slug) => void linkRecipe(videoId, recipeId, title, slug)}
        onCreate={(videoId) => void startCreate(videoId)}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">
              Period performance
              <SourceMark source="ANALYTICS" />
            </h2>
            <p className="mt-1 text-sm text-muted">
              Last {analytics.rangeDays} days · independent of public Data API counters.
            </p>
          </div>
          {analyticsConnected ? (
            <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-xs">
              {ANALYTICS_RANGE_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`min-h-[44px] rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                    analytics.rangeDays === days ? "bg-sand text-ink" : "text-muted hover:text-ink"
                  } ${adminFocusRing}`}
                  onClick={() => updateRange(days)}
                >
                  Last {days} days
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            label="Views"
            value={analyticsConnected ? analytics.channel.views : "—"}
            note={analyticsConnected ? `Last ${analytics.rangeDays} days` : "Connect Analytics"}
          />
          <SummaryCard
            label="Watch time"
            value={analyticsConnected ? analytics.channel.watchTime : "—"}
            note={analyticsConnected ? `Estimated hours · last ${analytics.rangeDays} days` : undefined}
          />
          <SummaryCard
            label="Net subscribers"
            value={analyticsConnected ? analytics.channel.subscriberGrowth : "—"}
            note={analyticsConnected ? `Gained − lost · last ${analytics.rangeDays} days` : undefined}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border border-line bg-paper px-4 py-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Retention · Analytics
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MiniStat
                label="Average % viewed"
                value={analyticsConnected ? analytics.channel.averageViewPercentage : "—"}
              />
              <MiniStat
                label="Average view duration"
                value={analyticsConnected ? analytics.channel.averageViewDuration : "—"}
              />
            </div>
            {analyticsConnected ? (
              <p className="mt-3 text-xs leading-snug text-muted">{YOUTUBE_ANALYTICS_RETENTION_FOOTNOTE}</p>
            ) : null}
          </div>
          <div className="rounded-sm border border-line bg-paper px-4 py-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Diagnostics · Analytics
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MiniStat
                label="Subscribers gained"
                value={analyticsConnected ? analytics.channel.subscribersGained : "—"}
              />
              <MiniStat
                label="Subscribers lost"
                value={analyticsConnected ? analytics.channel.subscribersLost : "—"}
              />
              <MiniStat label="Shares" value={analyticsConnected ? analytics.channel.shares : "—"} />
            </div>
          </div>
        </div>
      </section>

      {channel ? (
        <>
          <ChannelSnapshot channel={channel} />
          <CatalogCoverageSection
            coverage={coverage}
            summary={summary}
            onFilter={updateFilter}
            onRecipesWithoutVideo={() => router.push("/admin/recipes")}
            importedSeriesCount={importedSeriesCount}
            showSeriesUtility={showSeriesUtility}
          />
        </>
      ) : (
        <div className="rounded-sm border border-line bg-sand/30 p-6 text-sm text-muted">
          <p>No YouTube channel data yet.</p>
          {canSync ? (
            <p className="mt-2">Use Refresh public YouTube to fetch Mesa Kitchen Studio channel metadata.</p>
          ) : (
            <p className="mt-2">Ask an owner to run the first refresh.</p>
          )}
        </div>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">Videos</h2>
            <p className="mt-1 text-xs text-muted">
              Full synced public catalog · Long {summary.longVideos ?? 0} · Shorts {summary.shorts ?? 0}
              {(summary.unknownFormat ?? 0) > 0 ? ` · Unknown ${summary.unknownFormat}` : ""}
            </p>
          </div>
          <label className="grid w-full max-w-xs gap-1 text-xs sm:w-auto">
            <span className="font-semibold text-ink">Search videos</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by title…"
              className={`min-h-[44px] rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
            />
          </label>
        </div>

        <div className="mt-3 flex max-w-full flex-wrap gap-1 rounded-sm border border-line bg-paper p-1 text-xs">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`min-h-[44px] rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                filter === value ? "bg-sand text-ink" : "text-muted hover:text-ink"
              } ${adminFocusRing}`}
              onClick={() => updateFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex max-w-full flex-wrap gap-1 rounded-sm border border-line bg-cream/30 p-1 text-xs">
          {SORT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`min-h-[44px] rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                sortKey === value ? "bg-sand text-ink" : "text-muted hover:text-ink"
              } ${adminFocusRing}`}
              onClick={() => selectSort(value)}
            >
              {label}
              {sortKey === value && value !== "performance" ? (
                <span aria-hidden="true" className="ml-1">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-sm border border-line md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-paper">
              <tr className={adminTableHeadClass}>
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th
                  className="px-4 py-3 font-medium"
                  aria-sort={
                    sortKey === "performance" || sortKey === "periodViews"
                      ? "descending"
                      : "none"
                  }
                >
                  Performance · {periodSuffix}
                </th>
                <th
                  className="px-4 py-3 font-medium"
                  aria-sort={sortKey === "subscribersGained" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  Subscribers
                </th>
                <th className="px-4 py-3 font-medium">Recipe relationship</th>
                <th className="px-4 py-3 font-medium">Content health / action</th>
              </tr>
            </thead>
            <tbody>
              {catalogVideos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-muted">
                    {videos.length === 0 ? "No synced public videos yet." : "No videos match this filter."}
                  </td>
                </tr>
              ) : (
                catalogVideos.map((video) => (
                  <tr key={video.videoId} className="border-t border-line/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/youtube/videos/${video.videoId}?range=${analytics.rangeDays}`}
                        className={`flex min-w-[12rem] items-center gap-3 ${adminLinkClass}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={video.thumbnailUrl} alt="" className="h-10 w-[4.5rem] shrink-0 rounded-sm object-cover" />
                        <span className="line-clamp-2 font-medium text-ink">{video.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{video.formatLabel}</td>
                    <td className="px-4 py-3">
                      {analyticsConnected ? (
                        <div className="space-y-0.5 text-xs">
                          <p>{video.analytics?.periodViews ?? "—"} views</p>
                          <p className="text-muted">{video.analytics?.watchTime ?? "—"} watch</p>
                          <p className="text-muted">{video.analytics?.averageViewPercentage ?? "—"} avg % viewed</p>
                        </div>
                      ) : (
                        <span className="text-muted">{video.views7d} · 7d views</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{analyticsConnected ? video.analytics?.subscribersGained ?? "—" : "—"}</td>
                    <td className="px-4 py-3">
                      <p className={`font-semibold ${relationshipClass(video.relationship)}`}>{video.relationship}</p>
                      {renderRecipeActions(video)}
                    </td>
                    <td className="px-4 py-3">
                      <p className={`font-semibold ${contentHealthClass(video.contentHealth)}`}>{video.contentHealth}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {catalogVideos.length === 0 ? (
            <p className="rounded-sm border border-line bg-paper px-4 py-6 text-sm text-muted">
              {videos.length === 0 ? "No synced public videos yet." : "No videos match this filter."}
            </p>
          ) : (
            catalogVideos.map((video) => (
              <article key={video.videoId} className="rounded-sm border border-line bg-paper p-4">
                <Link
                  href={`/admin/youtube/videos/${video.videoId}?range=${analytics.rangeDays}`}
                  className={`flex items-start gap-3 ${adminLinkClass}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-sm object-cover" />
                  <div>
                    <p className="font-medium text-ink">{video.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {video.formatLabel} · {video.relationship}
                    </p>
                  </div>
                </Link>
                {analyticsConnected ? (
                  <p className="mt-3 text-xs text-muted">
                    {video.analytics?.periodViews ?? "—"} views · {video.analytics?.watchTime ?? "—"} ·{" "}
                    {video.analytics?.averageViewPercentage ?? "—"} avg % viewed
                  </p>
                ) : null}
                <div className="mt-3">{renderRecipeActions(video)}</div>
                <p className={`mt-2 text-xs font-semibold ${contentHealthClass(video.contentHealth)}`}>
                  {video.contentHealth}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="yt-create-recipe-title"
        >
          <div className="w-full max-w-md rounded-sm border border-line bg-paper px-5 py-5 shadow-lg">
            <h3 id="yt-create-recipe-title" className="font-serif text-xl text-ink">
              Create recipe
            </h3>
            {confirm.confidence === "MEDIUM" && confirm.typeName ? (
              <p className="mt-3 text-sm text-muted">
                AI suggested recipe type:{" "}
                <span className="font-semibold text-ink">{confirm.typeName}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">{confirm.message || "Pick a recipe type to continue."}</p>
            )}
            {confirm.reasoning ? <p className="mt-2 text-xs text-muted">{confirm.reasoning}</p> : null}
            <label className="mt-4 grid gap-1 text-sm">
              <span className="text-xs font-semibold text-ink">Recipe type</span>
              <select
                value={confirm.typeId}
                onChange={(event) => setConfirm({ ...confirm, typeId: event.target.value })}
                className={`rounded-sm border border-line bg-paper px-3 py-2 ${adminFocusRing}`}
              >
                <option value="">Select type…</option>
                {recipeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
                disabled={!confirm.typeId}
                onClick={() =>
                  void createWithType(
                    confirm.videoId,
                    confirm.typeId,
                    confirm.confidence === "MEDIUM" ? "ai" : "manual",
                    confirm.confidence,
                  )
                }
              >
                Create recipe
              </button>
              <button
                type="button"
                className={`${secondaryBtn} ${adminFocusRing}`}
                onClick={() => {
                  setConfirm(null);
                  setPhase(confirm.videoId, "idle");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FreshnessBar({
  analytics,
  channel,
  canSync,
  canManageAnalytics,
  analyticsPending,
  dataPending,
  onSync,
  onRefreshAnalytics,
  onDisconnectAnalytics,
}: {
  analytics: AnalyticsSummary;
  channel: ChannelSummary | null;
  canSync: boolean;
  canManageAnalytics: boolean;
  analyticsPending: boolean;
  dataPending: boolean;
  onSync: () => void;
  onRefreshAnalytics: () => void;
  onDisconnectAnalytics: () => void;
}) {
  return (
    <div className="rounded-sm border border-line bg-cream/30 px-4 py-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Data freshness</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <p className="font-semibold text-ink">Analytics</p>
            <p className="text-xs text-muted">
              {analytics.connection.connected
                ? analytics.connection.lastSyncAt
                  ? `Updated ${formatAdminDateTime(analytics.connection.lastSyncAt)}`
                  : "Never refreshed"
                : "Not connected"}
            </p>
          </div>
          {canManageAnalytics ? (
            <div className="flex flex-wrap gap-2">
              {!analytics.connection.connected ? (
                <a href="/api/admin/youtube/analytics/oauth/start" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
                  Connect
                </a>
              ) : (
                <>
                  <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} disabled={analyticsPending} onClick={onRefreshAnalytics}>
                    {analyticsPending ? "Refreshing…" : "Refresh"}
                  </button>
                  <button type="button" className={`text-xs font-semibold text-muted underline ${adminFocusRing}`} disabled={analyticsPending} onClick={onDisconnectAnalytics}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <p className="font-semibold text-ink">Public YouTube</p>
            <p className="text-xs text-muted">{channel?.lastSyncedAt ? `Updated ${channel.lastSyncedAt}` : "Not synced"}</p>
          </div>
          {canSync ? (
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} disabled={dataPending} onClick={onSync}>
              {dataPending ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>
        <div className="text-sm">
          <p className="font-semibold text-ink">Mesa catalog</p>
          <p className="text-xs text-muted">Live recipe relationships</p>
        </div>
      </div>
    </div>
  );
}

function NeedsAttentionSection({
  items,
  total,
  allItems,
  reviewAllOpen,
  onToggleReviewAll,
  onFilter,
  canCreateRecipes,
  onLink,
  onCreate,
}: {
  items: AttentionQueueItem[];
  total: number;
  allItems: AttentionQueueItem[];
  reviewAllOpen: boolean;
  onToggleReviewAll: () => void;
  onFilter: (target: string) => void;
  canCreateRecipes: boolean;
  onLink: (videoId: string, recipeId: string, title: string, slug: string) => void;
  onCreate: (videoId: string) => void;
}) {
  if (total === 0) {
    return (
      <section className="rounded-sm border border-line bg-paper px-4 py-4">
        <h2 className="font-serif text-xl text-ink">Needs attention</h2>
        <p className="mt-2 text-sm text-muted">No operational items right now.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Needs attention</h2>
        {total > items.length ? (
          <button type="button" className={`text-sm font-semibold ${adminLinkClass}`} onClick={onToggleReviewAll}>
            {reviewAllOpen ? "Hide all" : "Review all"}
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-sm border border-line bg-paper px-4 py-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-terracotta">{item.title}</p>
            <p className="mt-2 text-sm text-ink">{item.detail}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.actionKind === "link-recipe" && item.videoId && item.possibleMatchRecipeId && canCreateRecipes ? (
                <>
                  <button
                    type="button"
                    className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
                    onClick={() =>
                      onLink(
                        item.videoId!,
                        item.possibleMatchRecipeId!,
                        item.possibleMatchRecipeTitle || "Recipe",
                        "",
                      )
                    }
                  >
                    Link recipe
                  </button>
                  <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={() => onCreate(item.videoId!)}>
                    Create new
                  </button>
                </>
              ) : item.actionKind === "create-recipe" && item.videoId && canCreateRecipes ? (
                <button type="button" className={`${adminPrimaryButtonClass} ${adminFocusRing}`} onClick={() => onCreate(item.videoId!)}>
                  Create or link
                </button>
              ) : item.actionKind === "review-queue" && item.filterTarget ? (
                <button type="button" className={`${adminPrimaryButtonClass} ${adminFocusRing}`} onClick={() => onFilter(item.filterTarget!)}>
                  {item.actionLabel}
                </button>
              ) : item.href ? (
                <Link href={item.href} className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
                  {item.actionLabel}
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {reviewAllOpen ? (
        <ul className="space-y-2 rounded-sm border border-line bg-paper px-4 py-4">
          {allItems.map((item) => (
            <li key={item.id} className="border-b border-line/60 pb-2 text-sm last:border-0 last:pb-0">
              {item.href ? (
                <Link href={item.href} className={adminLinkClass}>
                  {item.detail}
                </Link>
              ) : (
                item.detail
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ChannelSnapshot({ channel }: { channel: ChannelSummary }) {
  const subscriberTrend =
    channel.trendSubscribers7d && channel.trendFromDate && channel.trendToDate
      ? `${channel.trendSubscribers7d} since ${channel.trendFromDate} → ${channel.trendToDate}`
      : channel.trendSubscribers7d
        ? `${channel.trendSubscribers7d} · 7-day snapshot delta`
        : null;

  return (
    <section className="rounded-sm border border-line bg-paper px-4 py-4">
      <h2 className="font-serif text-xl text-ink">
        Public channel snapshot
        <SourceMark source="DATA API" />
      </h2>
      <p className="mt-1 text-xs text-muted">Independent of selected Analytics period.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Subscribers" value={channel.subscriberCount} />
        <MiniStat label="Public videos" value={channel.videoCount} />
        <MiniStat label="Lifetime views" value={channel.viewCount} />
        <MiniStat label="Subscriber change" value={subscriberTrend || "—"} />
      </div>
    </section>
  );
}

function CatalogCoverageSection({
  coverage,
  summary,
  onFilter,
  onRecipesWithoutVideo,
  importedSeriesCount,
  showSeriesUtility,
}: {
  coverage: { video: VideoCoverageStats; recipe: RecipeCoverageStats };
  summary: {
    linkedVideos: number;
    videosWithoutRecipes: number;
    recipesWithoutVideo: number;
  };
  onFilter: (filter: YoutubeDashboardVideoFilter) => void;
  onRecipesWithoutVideo: () => void;
  importedSeriesCount: number;
  showSeriesUtility: boolean;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-xl text-ink">
          Catalog coverage
          <SourceMark source="MESA" />
        </h2>
        {coverage.video.inventoryMismatch ? (
          <p className="mt-2 rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-xs text-terracotta" role="alert">
            Data integrity: Mesa has {coverage.video.syncedPublicVideoCount} synced public videos but YouTube
            reports {coverage.video.channelVideoCount}. Refresh public YouTube data.
          </p>
        ) : null}
      </div>
      <div className="space-y-4 rounded-sm border border-line bg-paper px-4 py-4">
        <CoverageRow
          label="Videos linked to recipes"
          numerator={coverage.video.linkedCount}
          denominator={coverage.video.syncedPublicVideoCount}
          percentage={coverage.video.percentage}
          remainderLabel={`${summary.videosWithoutRecipes} unlinked`}
          onRemainderClick={() => onFilter("needs")}
        />
        <CoverageRow
          label="Recipes with YouTube videos"
          numerator={coverage.recipe.withVideoCount}
          denominator={coverage.recipe.publishedRecipeCount}
          percentage={coverage.recipe.percentage}
          remainderLabel={`${summary.recipesWithoutVideo} without video`}
          onRemainderClick={onRecipesWithoutVideo}
        />
        {showSeriesUtility ? (
          <div className="border-t border-line/70 pt-4 text-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Series</p>
            <p className="mt-1 text-ink">
              {importedSeriesCount} YouTube playlist{importedSeriesCount === 1 ? "" : "s"} imported as Mesa Series
            </p>
            <Link href="/admin/series" className={`mt-2 inline-block font-semibold text-olive hover:underline ${adminFocusRing}`}>
              Manage Series →
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CoverageRow({
  label,
  numerator,
  denominator,
  percentage,
  remainderLabel,
  onRemainderClick,
}: {
  label: string;
  numerator: number;
  denominator: number;
  percentage: number;
  remainderLabel: string;
  onRemainderClick: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-sm text-muted">
          {numerator} of {denominator} · {percentage}%
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand/60">
        <div className="h-full rounded-full bg-olive/70" style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
      <button type="button" className={`mt-2 text-xs font-semibold ${adminLinkClass}`} onClick={onRemainderClick}>
        {remainderLabel}
      </button>
    </div>
  );
}

function SourceMark({ source }: { source: "ANALYTICS" | "DATA API" | "MESA" }) {
  return (
    <span className="ml-2 align-middle text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted">
      {source}
    </span>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">{label}</p>
      <p className="mt-2 font-serif text-2xl text-ink">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-serif text-lg text-ink">{value}</p>
    </div>
  );
}
