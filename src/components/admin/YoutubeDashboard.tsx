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
import type { AttentionReviewGroup } from "@/lib/youtube-data/attention-review";
import type { RecipeCoverageStats, VideoCoverageStats } from "@/lib/youtube-data/coverage";
import { formatVideoLinkScopeBreakdown } from "@/lib/youtube-data/coverage";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminSecondaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";
import { YOUTUBE_ANALYTICS_RETENTION_FOOTNOTE } from "@/lib/youtube-analytics/metric-copy";
import {
  parseYoutubeDashboardFilter,
  youtubeDashboardFilterQueryValue,
  type YoutubeDashboardVideoFilter,
} from "@/lib/youtube-data/video-format";
import type { AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";
import { ANALYTICS_RANGE_DAYS } from "@/lib/youtube-analytics/ranges";
import { formatAdminShortDateTime } from "@/lib/datetime";
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
  trendSubscribersShort: string | null;
  trendSubscribersTitle: string | null;
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
  { value: "missing-chapters", label: "Needs timestamps" },
  { value: "linked", label: "Linked" },
  { value: "metadata", label: "Metadata issues" },
];

const FORMAT_FILTERS = FILTER_OPTIONS.filter((option) =>
  option.value === "all" || option.value === "long" || option.value === "shorts",
);
const WORK_FILTERS = FILTER_OPTIONS.filter(
  (option) => option.value !== "all" && option.value !== "long" && option.value !== "shorts",
);

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

const secondaryBtn = adminSecondaryButtonClass;

function relationshipClass(value: string) {
  if (value === "Linked") return "text-muted";
  if (value === "Possible match") return "text-terracotta";
  return "text-muted";
}

function contentHealthClass(value: string) {
  if (value === "Chapters OK" || value === "—") return "text-muted";
  if (value === "Needs timestamps" || value === "Partially mapped") return "text-terracotta";
  if (value === "No chapter structure") return "text-muted";
  return "text-terracotta";
}

function ContentHealthText({ value }: { value: string }) {
  if (value === "—") {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not applicable</span>
      </>
    );
  }
  return <>{value}</>;
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
  attention: { top: AttentionQueueItem[]; total: number; review: AttentionReviewGroup[] };
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
        <div className="space-y-0.5">
          <p className={`text-xs ${relationshipClass(video.relationship)}`}>{video.relationship}</p>
          <Link href={`/admin/recipes/${video.recipe.id}`} className={`line-clamp-2 font-medium ${adminLinkClass}`}>
            {video.recipe.title}
          </Link>
        </div>
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
            <span className="font-medium text-ink">{video.possibleMatch.title}</span>
          </p>
        ) : (
          <p className="text-xs text-muted">Unlinked</p>
        )}
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
            aria-label={`Create recipe for ${video.title}`}
            onClick={() => void startCreate(video.videoId)}
          >
            {video.possibleMatch ? "Create new" : "Create recipe"}
          </button>
        </div>
      </div>
    );
  }

  function renderPerformanceCell(video: VideoRow) {
    if (analyticsConnected) {
      return (
        <div className="space-y-0.5 text-xs">
          <p>{video.analytics?.periodViews ?? "—"} views</p>
          <p className="text-muted">
            {video.analytics?.watchTime ?? "—"} · {video.analytics?.averageViewPercentage ?? "—"} viewed
          </p>
        </div>
      );
    }
    return <span className="text-muted">{video.views7d} · 7d views</span>;
  }

  const periodSuffix = `${analytics.rangeDays}d`;
  const analyticsConnected = analytics.connection.connected;

  return (
    <div className="space-y-10">
      <div className="max-w-3xl space-y-1.5">
        <p className="text-sm text-muted">Performance, coverage, and what to publish next.</p>
        <FreshnessStrip
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

      <NeedsAttentionSection
        items={attention.top}
        total={attention.total}
        reviewGroups={attention.review}
        reviewAllOpen={reviewAllOpen}
        onToggleReviewAll={() => setReviewAllOpen((open) => !open)}
        onFilter={(target) => updateFilter(parseYoutubeDashboardFilter(target))}
        canCreateRecipes={canCreateRecipes}
        onLink={(videoId, recipeId, title, slug) => void linkRecipe(videoId, recipeId, title, slug)}
        onCreate={(videoId) => void startCreate(videoId)}
      />

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-xl text-ink">Period performance</h2>
          <p className="mt-1 text-sm text-muted">Last {analytics.rangeDays} days</p>
          {analyticsConnected ? (
            <div
              className="mt-2 flex flex-wrap gap-1 text-xs"
              role="group"
              aria-label="Analytics date range"
            >
              {ANALYTICS_RANGE_DAYS.map((days) => {
                const selected = analytics.rangeDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={selected}
                    className={`min-h-[44px] rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                      selected ? "bg-sand text-ink" : "text-muted hover:text-ink"
                    } ${adminFocusRing}`}
                    onClick={() => updateRange(days)}
                  >
                    {days} days
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 border-y border-line/70 py-4 sm:grid-cols-3 sm:gap-6">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Views</p>
            <p className="mt-1 font-serif text-2xl text-ink">
              {analyticsConnected ? analytics.channel.views : "—"}
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Watch time</p>
            <p className="mt-1 font-serif text-2xl text-ink">
              {analyticsConnected ? analytics.channel.watchTime : "—"}
            </p>
            {analyticsConnected ? <p className="mt-0.5 text-xs text-muted">Estimated</p> : null}
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Net subscribers</p>
            <p className="mt-1 font-serif text-2xl text-ink">
              {analyticsConnected ? analytics.channel.subscriberGrowth : "—"}
            </p>
            {analyticsConnected ? (
              <p className="mt-0.5 text-xs text-muted">
                {analytics.channel.subscribersGained} gained · {analytics.channel.subscribersLost} lost
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-6">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Average % viewed</p>
            <p className="mt-1 text-sm text-ink">
              {analyticsConnected ? analytics.channel.averageViewPercentage : "—"}
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Average view duration</p>
            <p className="mt-1 text-sm text-ink">
              {analyticsConnected ? analytics.channel.averageViewDuration : "—"}
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Shares</p>
            <p className="mt-1 text-sm text-ink">{analyticsConnected ? analytics.channel.shares : "—"}</p>
          </div>
        </div>
        {analyticsConnected ? (
          <p className="mt-1 text-xs leading-snug text-muted">{YOUTUBE_ANALYTICS_RETENTION_FOOTNOTE}</p>
        ) : null}
      </section>

      {channel ? (
        <>
          <CatalogCoverageSection
            coverage={coverage}
            summary={summary}
            onFilter={updateFilter}
            onRecipesWithoutVideo={() => router.push("/admin/recipes")}
            importedSeriesCount={importedSeriesCount}
            showSeriesUtility={showSeriesUtility}
          />
          <ChannelSnapshot channel={channel} />
        </>
      ) : (
        <div className="border-t border-line/70 py-4 text-sm text-muted">
          <p>No YouTube channel data yet.</p>
          {canSync ? (
            <p className="mt-2">Use Refresh public YouTube to fetch Mesa Kitchen Studio channel metadata.</p>
          ) : (
            <p className="mt-2">Ask an owner to run the first refresh.</p>
          )}
        </div>
      )}

      <section>
        <div>
          <h2 className="font-serif text-xl text-ink">Videos</h2>
          <p className="mt-1 text-xs text-muted">
            Full synced public catalog · Long {summary.longVideos ?? 0} · Shorts {summary.shorts ?? 0}
            {(summary.unknownFormat ?? 0) > 0 ? ` · Unknown ${summary.unknownFormat}` : ""}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="grid w-full gap-1 text-xs sm:w-[20rem] sm:max-w-[22.5rem]">
              <span className="font-semibold text-ink">Search titles</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by title…"
                className={`min-h-[44px] w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
              />
            </label>
            <label className="grid w-full gap-1 text-xs sm:w-auto">
              <span className="font-semibold text-ink">Sort</span>
              <select
                value={sortKey}
                onChange={(event) => selectSort(event.target.value as CatalogVideoSortKey)}
                className={`min-h-[44px] rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-10 sm:gap-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" role="group" aria-label="Format">
              <span className="shrink-0 font-semibold text-olive">Format</span>
              {FORMAT_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`min-h-[44px] rounded-sm px-2 py-1.5 font-semibold transition-colors ${
                    filter === value ? "bg-sand text-ink" : "text-muted hover:text-ink"
                  } ${adminFocusRing}`}
                  onClick={() => updateFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" role="group" aria-label="Work">
              <span className="shrink-0 font-semibold text-olive">Work</span>
              {WORK_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`min-h-[44px] rounded-sm px-2 py-1.5 font-semibold transition-colors ${
                    filter === value ? "bg-sand text-ink" : "text-muted hover:text-ink"
                  } ${adminFocusRing}`}
                  onClick={() => updateFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-paper">
              <tr className={adminTableHeadClass}>
                <th scope="col" className="px-4 py-3 font-medium">
                  Video
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-medium"
                  aria-sort={
                    sortKey === "performance" || sortKey === "periodViews" ? "descending" : "none"
                  }
                >
                  Performance · {periodSuffix}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-medium"
                  aria-sort={
                    sortKey === "subscribersGained"
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  Subs gained · {periodSuffix}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Recipe
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Content health
                </th>
              </tr>
            </thead>
            <tbody>
              {catalogVideos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-muted">
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
                        <span className="min-w-0">
                          <span className="line-clamp-2 font-medium text-ink" title={video.title}>
                            {video.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">{video.formatLabel}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{renderPerformanceCell(video)}</td>
                    <td className="px-4 py-3">
                      {analyticsConnected ? video.analytics?.subscribersGained ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3">{renderRecipeActions(video)}</td>
                    <td className="px-4 py-3">
                      <p className={`text-xs ${contentHealthClass(video.contentHealth)}`}>
                        <ContentHealthText value={video.contentHealth} />
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {catalogVideos.length === 0 ? (
            <p className="border-t border-line/70 py-6 text-sm text-muted">
              {videos.length === 0 ? "No synced public videos yet." : "No videos match this filter."}
            </p>
          ) : (
            catalogVideos.map((video) => (
              <article key={video.videoId} className="border-t border-line/70 py-4">
                <Link
                  href={`/admin/youtube/videos/${video.videoId}?range=${analytics.rangeDays}`}
                  className={`flex items-start gap-3 ${adminLinkClass}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-sm object-cover" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium text-ink" title={video.title}>
                      {video.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">{video.formatLabel}</p>
                  </div>
                </Link>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-muted">Performance</p>
                    <div className="mt-1">{renderPerformanceCell(video)}</div>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-muted">
                      Subs gained · {periodSuffix}
                    </p>
                    <p className="mt-1 text-ink">
                      {analyticsConnected ? video.analytics?.subscribersGained ?? "—" : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-muted">Recipe</p>
                    <div className="mt-1">{renderRecipeActions(video)}</div>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-muted">Content health</p>
                    <p className={`mt-1 ${contentHealthClass(video.contentHealth)}`}>
                      <ContentHealthText value={video.contentHealth} />
                    </p>
                  </div>
                </div>
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

function FreshnessStrip({
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
  const analyticsLabel = analytics.connection.connected
    ? analytics.connection.lastSyncAt
      ? formatAdminShortDateTime(analytics.connection.lastSyncAt)
      : "Never refreshed"
    : "Not connected";
  const youtubeLabel = channel?.lastSyncedAt ? channel.lastSyncedAt.replace(" GMT", "") : "Not synced";

  const stripText = `Analytics updated ${analyticsLabel} · Public YouTube ${youtubeLabel} · Catalog live`;

  return (
    <details className="group w-full max-w-[30rem] text-sm">
      <summary
        className={`cursor-pointer list-none py-0.5 text-xs text-muted marker:content-none ${adminFocusRing}`}
      >
        <span className="group-open:hidden">
          <span className="text-muted">{stripText}</span>
          <span className="ml-1.5 font-semibold text-ink">Data status ▾</span>
        </span>
        <span className="hidden font-semibold text-ink group-open:inline">Data status ▴</span>
      </summary>
      <div className="mt-2 w-full max-w-[30rem] rounded-sm border border-line bg-paper px-3 py-3">
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="font-semibold text-ink">Analytics</dt>
            <dd className="text-muted">{analyticsLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Public YouTube</dt>
            <dd className="text-muted">{channel?.lastSyncedAt ? `Updated ${channel.lastSyncedAt}` : "Not synced"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Mesa catalog</dt>
            <dd className="text-muted">Live recipe relationships</dd>
          </div>
        </dl>
        {canManageAnalytics || canSync ? (
          <div className="mt-3 space-y-2 border-t border-line/70 pt-3">
            {canManageAnalytics ? (
              <div className="space-y-2">
                {!analytics.connection.connected ? (
                  <a href="/api/admin/youtube/analytics/oauth/start" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
                    Connect Analytics
                  </a>
                ) : (
                  <>
                    <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} disabled={analyticsPending} onClick={onRefreshAnalytics}>
                      {analyticsPending ? "Refreshing…" : "Refresh Analytics"}
                    </button>
                    {canSync ? (
                      <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} disabled={dataPending} onClick={onSync}>
                        {dataPending ? "Refreshing…" : "Refresh Public YouTube"}
                      </button>
                    ) : null}
                    <div className="border-t border-line/50 pt-2">
                      <button
                        type="button"
                        className={`text-xs font-semibold text-terracotta underline ${adminFocusRing}`}
                        disabled={analyticsPending}
                        onClick={onDisconnectAnalytics}
                      >
                        Disconnect Analytics
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {canSync && !(canManageAnalytics && analytics.connection.connected) ? (
              <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} disabled={dataPending} onClick={onSync}>
                {dataPending ? "Refreshing…" : "Refresh Public YouTube"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function NeedsAttentionSection({
  items,
  total,
  reviewGroups,
  reviewAllOpen,
  onToggleReviewAll,
  onFilter,
  canCreateRecipes,
  onLink,
  onCreate,
}: {
  items: AttentionQueueItem[];
  total: number;
  reviewGroups: AttentionReviewGroup[];
  reviewAllOpen: boolean;
  onToggleReviewAll: () => void;
  onFilter: (target: string) => void;
  canCreateRecipes: boolean;
  onLink: (videoId: string, recipeId: string, title: string, slug: string) => void;
  onCreate: (videoId: string) => void;
}) {
  if (total === 0) {
    return (
      <section className="border-t border-line/70 py-4">
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
          <button
            type="button"
            className={`text-sm font-semibold ${adminLinkClass}`}
            aria-expanded={reviewAllOpen}
            aria-controls="attention-review-all"
            onClick={onToggleReviewAll}
          >
            {reviewAllOpen ? "Show less" : "Review all"}
          </button>
        ) : null}
      </div>
      <div className="divide-y divide-line/70 border-t border-line/70">
        {items.map((item) => {
          const actions =
            item.actionKind === "link-recipe" && item.videoId && item.possibleMatchRecipeId && canCreateRecipes ? (
              <>
                <button
                  type="button"
                  className={compactLinkBtn}
                  onClick={() =>
                    onLink(
                      item.videoId!,
                      item.possibleMatchRecipeId!,
                      item.possibleMatchRecipeTitle || "Recipe",
                      item.possibleMatchRecipeSlug || "",
                    )
                  }
                >
                  Link recipe
                </button>
                <button type="button" className={compactLinkBtn} onClick={() => onCreate(item.videoId!)}>
                  Create new
                </button>
              </>
            ) : item.actionKind === "create-recipe" && item.videoId && canCreateRecipes ? (
              <button
                type="button"
                className={compactLinkBtn}
                aria-label={item.videoTitle ? `Create recipe for ${item.videoTitle}` : "Create recipe"}
                onClick={() => onCreate(item.videoId!)}
              >
                Create recipe
              </button>
            ) : item.actionKind === "review-queue" && item.filterTarget ? (
              <button type="button" className={compactLinkBtn} onClick={() => onFilter(item.filterTarget!)}>
                {item.actionLabel}
              </button>
            ) : item.href ? (
              <Link href={item.href} className={compactLinkBtn}>
                {item.actionLabel}
              </Link>
            ) : null;

          return (
            <div
              key={item.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 space-y-0.5">
                {item.actionKind === "link-recipe" && item.possibleMatchRecipeId ? (
                  <>
                    <p className="text-xs font-semibold text-terracotta">{item.title}</p>
                    <p className="font-medium text-ink">{item.possibleMatchRecipeTitle}</p>
                    {item.videoTitle ? <p className="text-sm text-muted">{item.videoTitle}</p> : null}
                    {item.detail ? <p className="text-sm text-muted">{item.detail}</p> : null}
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-terracotta">{item.title}</p>
                    <p className="text-sm text-ink">{item.detail}</p>
                    {item.metricsContext ? (
                      <p className="text-xs text-muted">{item.metricsContext}</p>
                    ) : null}
                  </>
                )}
              </div>
              {actions ? (
                <div className="flex shrink-0 flex-wrap gap-3 sm:justify-end">{actions}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      {reviewAllOpen ? (
        <AttentionReviewPanel
          id="attention-review-all"
          groups={reviewGroups}
          canCreateRecipes={canCreateRecipes}
          onFilter={onFilter}
          onLink={onLink}
          onCreate={onCreate}
        />
      ) : null}
    </section>
  );
}

function AttentionReviewPanel({
  id,
  groups,
  canCreateRecipes,
  onFilter,
  onLink,
  onCreate,
}: {
  id: string;
  groups: AttentionReviewGroup[];
  canCreateRecipes: boolean;
  onFilter: (target: string) => void;
  onLink: (videoId: string, recipeId: string, title: string, slug: string) => void;
  onCreate: (videoId: string) => void;
}) {
  if (!groups.length) return null;

  return (
    <div id={id} className="space-y-6 border-t border-line/70 pt-4" aria-label="Full attention queue">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`${id}-${group.id}-heading`}>
          <h3
            id={`${id}-${group.id}-heading`}
            className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive"
          >
            {group.label}
          </h3>
          {group.collapsed ? (
            <div className="mt-2 space-y-1.5 text-sm">
              <p className="text-ink">{group.collapsed.summaryLine}</p>
              {group.collapsed.examples.map((example) => (
                <p key={example} className="text-muted">
                  {example}
                </p>
              ))}
              {group.collapsed.moreCount > 0 ? (
                <p className="text-xs text-muted">+{group.collapsed.moreCount} more</p>
              ) : null}
              {group.collapsed.topByViews ? (
                <p className="text-xs text-muted">
                  Top by views: {group.collapsed.topByViews.title} · {group.collapsed.topByViews.viewsLabel} views
                </p>
              ) : null}
              <div className="pt-1">
                {group.collapsed.actionKind === "review-queue" && group.collapsed.filterTarget ? (
                  <button
                    type="button"
                    className={compactLinkBtn}
                    onClick={() => onFilter(group.collapsed!.filterTarget!)}
                  >
                    {group.collapsed.actionLabel}
                  </button>
                ) : group.collapsed.href ? (
                  <Link href={group.collapsed.href} className={compactLinkBtn}>
                    {group.collapsed.actionLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line/60">
              {group.entities.map((entity) => (
                <li key={entity.id} className="py-2.5 first:pt-0">
                  {entity.actionKind === "link-recipe" && entity.possibleMatchRecipeId ? (
                    <>
                      <p className="text-xs font-semibold text-terracotta">Possible match</p>
                      <p className="mt-0.5 font-medium text-ink">{entity.possibleMatchRecipeTitle}</p>
                      {entity.videoTitle ? <p className="mt-0.5 text-xs text-muted">{entity.videoTitle}</p> : null}
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-ink">{entity.entityLabel}</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                        {entity.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    {entity.actionKind === "link-recipe" && entity.videoId && entity.possibleMatchRecipeId && canCreateRecipes ? (
                      <>
                        <button
                          type="button"
                          className={compactLinkBtn}
                          onClick={() =>
                            onLink(
                              entity.videoId!,
                              entity.possibleMatchRecipeId!,
                              entity.possibleMatchRecipeTitle || "Recipe",
                              entity.possibleMatchRecipeSlug || "",
                            )
                          }
                        >
                          Link recipe
                        </button>
                        <button type="button" className={compactLinkBtn} onClick={() => onCreate(entity.videoId!)}>
                          Create new
                        </button>
                      </>
                    ) : entity.actionKind === "create-recipe" && entity.videoId && canCreateRecipes ? (
                      <button
                        type="button"
                        className={compactLinkBtn}
                        aria-label={
                          entity.videoTitle || entity.entityLabel
                            ? `Create recipe for ${entity.videoTitle || entity.entityLabel}`
                            : "Create recipe"
                        }
                        onClick={() => onCreate(entity.videoId!)}
                      >
                        Create recipe
                      </button>
                    ) : entity.href ? (
                      <Link href={entity.href} className={compactLinkBtn}>
                        {entity.actionLabel}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function ChannelSnapshot({ channel }: { channel: ChannelSummary }) {
  const subscriberTrend = channel.trendSubscribersShort || channel.trendSubscribers7d || null;
  const subscriberTrendTitle = channel.trendSubscribersTitle || subscriberTrend || undefined;

  return (
    <section className="border-t border-line/70 py-3">
      <h2 className="text-sm font-semibold text-ink">Public channel</h2>
      <p className="mt-1 text-sm text-muted" title={subscriberTrendTitle}>
        {channel.subscriberCount} subscribers · {channel.videoCount} videos · {channel.viewCount} lifetime views
        {subscriberTrend ? ` · ${subscriberTrend}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted">Public totals are independent of the selected Analytics period.</p>
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
    <section className="space-y-3">
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
      <div className="space-y-4">
        <CoverageRow
          label="Videos with a Mesa recipe"
          numerator={coverage.video.linkedCount}
          denominator={coverage.video.syncedPublicVideoCount}
          percentage={coverage.video.percentage}
          remainderLabel={`${summary.videosWithoutRecipes} unlinked`}
          onRemainderClick={() => onFilter("needs")}
          scopeNote={
            coverage.video.linkScope ? formatVideoLinkScopeBreakdown(coverage.video.linkScope) : null
          }
        />
        <CoverageRow
          label="Published recipes with a video"
          numerator={coverage.recipe.withVideoCount}
          denominator={coverage.recipe.publishedRecipeCount}
          percentage={coverage.recipe.percentage}
          remainderLabel={`${summary.recipesWithoutVideo} without video`}
          onRemainderClick={onRecipesWithoutVideo}
        />
        {showSeriesUtility ? (
          <div className="border-t border-line/50 pt-3 text-sm text-muted">
            <p>
              {importedSeriesCount} YouTube playlist{importedSeriesCount === 1 ? "" : "s"} imported as Mesa Series
            </p>
            <Link href="/admin/series" className={`mt-1 inline-block text-xs font-semibold text-olive hover:underline ${adminFocusRing}`}>
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
  scopeNote,
}: {
  label: string;
  numerator: number;
  denominator: number;
  percentage: number;
  remainderLabel: string;
  onRemainderClick: () => void;
  scopeNote?: string | null;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink">{label}</p>
        <p className="text-sm text-muted" aria-label={`${numerator} of ${denominator}, ${percentage} percent`}>
          {numerator} of {denominator} · {percentage}%
        </p>
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand/60"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${numerator} of ${denominator}`}
      >
        <div className="h-full rounded-full bg-olive/70" style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
      {scopeNote ? <p className="mt-1 text-xs text-muted">{scopeNote}</p> : null}
      <button type="button" className={`mt-1.5 text-xs font-semibold ${adminLinkClass}`} onClick={onRemainderClick}>
        {remainderLabel}
      </button>
    </div>
  );
}

function SourceMark({ source }: { source: "ANALYTICS" | "DATA API" | "MESA" }) {
  return (
    <span className="ml-2 align-middle text-[0.55rem] font-medium uppercase tracking-[0.12em] text-muted/70">
      {source}
    </span>
  );
}
