"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  disconnectYoutubeAnalyticsAction,
  syncYoutubeAction,
  syncYoutubeAnalyticsAction,
} from "@/app/admin/actions";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";
import type { YouTubeVideoRowStatus } from "@/lib/youtube-data/types";
import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import {
  parseYoutubeDashboardFilter,
  youtubeDashboardFilterQueryValue,
  type YoutubeDashboardVideoFilter,
} from "@/lib/youtube-data/video-format";
import type { AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";
import { ANALYTICS_RANGE_DAYS } from "@/lib/youtube-analytics/ranges";
import { formatAdminDateTime } from "@/lib/datetime";

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
};

type VideoRow = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  views7d: string;
  format: YouTubeVideoFormat;
  formatLabel: string;
  recipe: { id: string; slug: string; title: string } | null;
  status: YouTubeVideoRowStatus;
  analytics?: {
    periodViews: string;
    watchTime: string;
    averageViewPercentage: string;
    subscribersGained: string;
    hasData: boolean;
  };
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
    hasData: boolean;
  };
  videoMetricsStatus?: string;
  videoMetricsNotice?: string;
};

type HealthIssue = {
  id: string;
  label: string;
  href?: string;
  kind: "video" | "recipe";
};

type HealthSummary = {
  videosNeedRecipes: number;
  recipesNeedVideos: number;
  metadataIssues: number;
  issues: HealthIssue[];
};

type RecipeTypeOption = { id: string; name: string };

type RowPhase =
  | "idle"
  | "detecting"
  | "confirm"
  | "creating"
  | "analyzing"
  | "opening"
  | "error";

type ConfirmState = {
  videoId: string;
  confidence: "MEDIUM" | "LOW";
  typeId: string;
  typeName?: string;
  message?: string;
  reasoning?: string;
};

const FILTER_OPTIONS: { value: YoutubeDashboardVideoFilter; label: string }[] = [
  { value: "all", label: "All videos" },
  { value: "long", label: "Long videos" },
  { value: "shorts", label: "Shorts" },
  { value: "needs", label: "Needs recipe" },
  { value: "linked", label: "Linked to recipe" },
];

const compactLinkBtn =
  "inline-flex items-center rounded-sm text-xs font-semibold text-terracotta transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-50";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function statusClass(status: YouTubeVideoRowStatus) {
  if (status === "Healthy") return "text-olive";
  if (status === "No recipe") return "text-muted";
  return "text-terracotta";
}

function formatTrend(value: string | null, label: string) {
  if (!value) return null;
  return `${value} ${label}`;
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
    case "error":
      return error || "Could not create recipe.";
    default:
      return null;
  }
}

export function YoutubeDashboard({
  channel,
  summary,
  videos: initialVideos,
  healthSummary,
  canSync,
  canManageAnalytics = false,
  canCreateRecipes = false,
  recipeTypes = [],
  initialFilter = "all",
  analytics,
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
  };
  videos: VideoRow[];
  healthSummary: HealthSummary;
  canSync: boolean;
  canManageAnalytics?: boolean;
  canCreateRecipes?: boolean;
  recipeTypes?: RecipeTypeOption[];
  initialFilter?: YoutubeDashboardVideoFilter | string;
  analytics: AnalyticsSummary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [analyticsPending, startAnalyticsTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [analyticsMessage, setAnalyticsMessage] = useState("");
  const [analyticsAlert, setAnalyticsAlert] = useState(analytics.connection.lastError);
  const [healthOpen, setHealthOpen] = useState(false);
  const [videos, setVideos] = useState(initialVideos);
  const [filter, setFilter] = useState<YoutubeDashboardVideoFilter>(() =>
    parseYoutubeDashboardFilter(initialFilter),
  );
  const [rowPhase, setRowPhase] = useState<Record<string, RowPhase>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    setFilter(parseYoutubeDashboardFilter(initialFilter));
  }, [initialFilter]);

  useEffect(() => {
    setAnalyticsAlert(analytics.connection.lastError);
  }, [analytics.connection.lastError]);

  function updateFilter(next: YoutubeDashboardVideoFilter) {
    setFilter(next);
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

  const filteredVideos = useMemo(() => {
    if (filter === "long") return videos.filter((video) => video.format === "LONG");
    if (filter === "shorts") return videos.filter((video) => video.format === "SHORT");
    if (filter === "needs") return videos.filter((video) => !video.recipe);
    if (filter === "linked") return videos.filter((video) => Boolean(video.recipe));
    return videos;
  }, [filter, videos]);

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

  function markLinked(videoId: string, recipe: { id: string; slug: string; title: string }) {
    setVideos((current) =>
      current.map((video) =>
        video.videoId === videoId
          ? {
              ...video,
              recipe,
              status: video.status === "No recipe" ? "Healthy" : video.status,
            }
          : video,
      ),
    );
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
    setAnalyticsAlert("");
    startAnalyticsTransition(async () => {
      const result = await syncYoutubeAnalyticsAction();
      if (result.ok) {
        if (result.videoMetricsStatus === "API_ERROR") {
          setAnalyticsAlert(
            "Per-video YouTube Analytics could not be loaded. Public YouTube data is still available.",
          );
          setAnalyticsMessage(
            `Channel analytics refreshed (${result.channelDays} channel days).`,
          );
        } else {
          setAnalyticsMessage(
            `Analytics refreshed (${result.channelDays} channel days, ${result.videoDays} video rows).`,
          );
        }
        router.refresh();
      } else {
        setAnalyticsAlert(result.error || "YouTube Analytics refresh failed.");
      }
    });
  }

  function onDisconnectAnalytics() {
    if (!window.confirm("Disconnect YouTube Analytics from Mesa? Public YouTube data sync will keep working.")) {
      return;
    }
    setAnalyticsMessage("");
    setAnalyticsAlert("");
    startAnalyticsTransition(async () => {
      const result = await disconnectYoutubeAnalyticsAction();
      if (result.ok) {
        setAnalyticsMessage("YouTube Analytics disconnected.");
        router.refresh();
      } else {
        setAnalyticsAlert(result.error || "Could not disconnect Analytics.");
      }
    });
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
        body: JSON.stringify({
          step: "create",
          videoId,
          typeId,
          typeSource,
          typeConfidence,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        recipeId?: string;
        recipeTitle?: string;
        recipeSlug?: string;
        alreadyExisted?: boolean;
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
    if (rowPhase[videoId] && rowPhase[videoId] !== "idle" && rowPhase[videoId] !== "error" && rowPhase[videoId] !== "confirm") {
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
        needsTypeConfirmation?: boolean;
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

  const periodSuffix = `${analytics.rangeDays}d`;
  const analyticsConnected = analytics.connection.connected;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">YouTube</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Channel analytics for the selected period, current public YouTube counters, and Mesa
            recipe coverage.
          </p>
        </div>
        {canSync ? (
          <div className="max-w-xs text-right">
            <button
              type="button"
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              disabled={pending}
              onClick={onSync}
            >
              {pending ? "Refreshing…" : "Refresh YouTube data"}
            </button>
            <p className="mt-2 text-xs leading-snug text-muted">
              Refreshes public channel and video counters from the YouTube Data API. Does not change
              Analytics period metrics or recipe content.
            </p>
          </div>
        ) : null}
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">
              YouTube Analytics
              <SourceMark source="ANALYTICS" />
            </h2>
            <p className="mt-1 text-sm text-muted">Performance for the selected reporting period.</p>
            {analyticsConnected ? (
              <p className="mt-1 text-sm text-muted">
                Connected as{" "}
                <span className="font-semibold text-ink">
                  {analytics.connection.channelTitle || "Mesa Kitchen Studio"}
                </span>
                {analytics.connection.googleAccountEmail
                  ? ` (${analytics.connection.googleAccountEmail})`
                  : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">YouTube Analytics is not connected.</p>
            )}
            <p className="mt-1 text-xs text-muted">
              OAuth Analytics metrics only. Separate from Refresh YouTube data (public Data API).
            </p>
            {analyticsConnected ? (
              <p className="mt-1 text-xs text-muted">
                Analytics last refreshed:{" "}
                <span className="font-medium text-ink">
                  {analytics.connection.lastSyncAt
                    ? formatAdminDateTime(analytics.connection.lastSyncAt)
                    : "Never"}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageAnalytics && !analyticsConnected ? (
              <a
                href="/api/admin/youtube/analytics/oauth/start"
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              >
                Connect YouTube Analytics
              </a>
            ) : null}
            {canManageAnalytics && analyticsConnected ? (
              <>
                <button
                  type="button"
                  className={`${secondaryBtn} ${adminFocusRing}`}
                  disabled={analyticsPending}
                  onClick={onRefreshAnalytics}
                >
                  {analyticsPending ? "Refreshing…" : "Refresh analytics"}
                </button>
                <button
                  type="button"
                  className={`${secondaryBtn} ${adminFocusRing}`}
                  disabled={analyticsPending}
                  onClick={onDisconnectAnalytics}
                >
                  Disconnect
                </button>
              </>
            ) : null}
          </div>
        </div>

        {analyticsConnected ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-xs">
              {ANALYTICS_RANGE_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                    analytics.rangeDays === days ? "bg-sand text-ink" : "text-muted hover:text-ink"
                  } ${adminFocusRing}`}
                  onClick={() => updateRange(days)}
                >
                  Last {days} days
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">Applies only to Analytics figures below and period columns in the video table.</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Subscriber growth"
            value={analyticsConnected ? analytics.channel.subscriberGrowth : "—"}
            note={
              analyticsConnected
                ? `Last ${analytics.rangeDays} days`
                : "Connect Analytics to see growth."
            }
          />
          <SummaryCard
            label="Views"
            value={analyticsConnected ? analytics.channel.views : "—"}
            note={
              analyticsConnected
                ? `Last ${analytics.rangeDays} days`
                : "Connect Analytics to see period views."
            }
          />
          <SummaryCard
            label="Watch time"
            value={analyticsConnected ? analytics.channel.watchTime : "—"}
            note={analyticsConnected ? `Estimated hours · last ${analytics.rangeDays} days` : undefined}
          />
          <SummaryCard
            label="Average view duration"
            value={analyticsConnected ? analytics.channel.averageViewDuration : "—"}
            note={analyticsConnected ? `mm:ss · last ${analytics.rangeDays} days` : undefined}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat
            label="Subscribers gained"
            value={analyticsConnected ? analytics.channel.subscribersGained : "—"}
          />
          <MiniStat
            label="Subscribers lost"
            value={analyticsConnected ? analytics.channel.subscribersLost : "—"}
          />
          <MiniStat
            label="Average percentage viewed"
            value={analyticsConnected ? analytics.channel.averageViewPercentage : "—"}
          />
          <MiniStat label="Shares" value={analyticsConnected ? analytics.channel.shares : "—"} />
        </div>
      </section>

      {!channel ? (
        <div className="rounded-sm border border-line bg-sand/30 p-6 text-sm text-muted">
          <p>No YouTube channel data yet.</p>
          {canSync ? (
            <p className="mt-2">Use Refresh YouTube data to fetch Mesa Kitchen Studio channel metadata.</p>
          ) : (
            <p className="mt-2">Ask an owner to run the first refresh.</p>
          )}
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="font-serif text-xl text-ink">
                YouTube public data
                <SourceMark source="DATA API" />
              </h2>
              <p className="mt-1 text-sm text-muted">
                Current public counters from the latest YouTube Data API refresh.
              </p>
              <p className="mt-1 text-xs text-muted">
                Not controlled by the Analytics Last 7 / 28 / 90 days selector.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryCard
                label="Subscribers"
                value={channel.subscriberCount}
                note={
                  channel.hiddenSubscriberCount
                    ? "Public count may be hidden or rounded by YouTube."
                    : "Current public subscriber count."
                }
              />
              <SummaryCard
                label="Public channel views"
                value={channel.viewCount}
                trend={formatTrend(channel.trendViews7d, "views / 7 days")}
                note="Lifetime public channel views."
              />
              <SummaryCard label="Public videos" value={channel.videoCount} note="Current public video count." />
              <SummaryCard
                label="YouTube Data last refreshed"
                value={channel.lastSyncedAt}
                note={
                  channel.lastSyncStatus === "error"
                    ? channel.lastSyncError
                    : "When public counters were last synced."
                }
              />
              <SummaryCard
                label="Public subscriber trend"
                value={channel.trendSubscribers7d || "—"}
                note="From public counter snapshots (7 days), not Analytics OAuth."
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="font-serif text-xl text-ink">
                Mesa content coverage
                <SourceMark source="MESA" />
              </h2>
              <p className="mt-1 text-sm text-muted">
                How Mesa recipes and YouTube videos are linked in this site.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Videos linked to recipes" value={String(summary.linkedVideos)} />
              <MiniStat label="Videos without recipes" value={String(summary.videosWithoutRecipes)} />
              <MiniStat label="Recipes with YouTube videos" value={String(summary.recipesWithVideo)} />
              <MiniStat label="Recipes without YouTube videos" value={String(summary.recipesWithoutVideo)} />
            </div>
          </section>
        </>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">Recent videos</h2>
            <p className="mt-1 text-xs text-muted">
              Lifetime / current columns are Data API
              {analyticsConnected ? `; period columns use Analytics · last ${analytics.rangeDays} days` : ""}.
              <span className="mx-1.5 text-line">·</span>
              Long videos: {summary.longVideos ?? 0}
              <span className="mx-1.5 text-line">·</span>
              Shorts: {summary.shorts ?? 0}
              {(summary.unknownFormat ?? 0) > 0 ? (
                <>
                  <span className="mx-1.5 text-line">·</span>
                  Unknown format: {summary.unknownFormat}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap gap-1 rounded-sm border border-line bg-paper p-1 text-xs">
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                  filter === value ? "bg-sand text-ink" : "text-muted hover:text-ink"
                } ${adminFocusRing}`}
                onClick={() => updateFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={adminTableHeadClass}>
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Published</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Lifetime views</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Current likes</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Current comments</th>
                {analyticsConnected ? (
                  <>
                    <th className="px-4 py-3 font-medium">Views · {periodSuffix}</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">
                      Watch time · {periodSuffix}
                    </th>
                    <th className="hidden px-4 py-3 font-medium xl:table-cell">
                      Avg viewed · {periodSuffix}
                    </th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">
                      Subs gained · {periodSuffix}
                    </th>
                  </>
                ) : (
                  <th className="hidden px-4 py-3 font-medium md:table-cell">7-day views</th>
                )}
                <th className="px-4 py-3 font-medium">Recipe</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={analyticsConnected ? 12 : 9} className="px-4 py-8 text-muted">
                    {videos.length === 0 ? "No synced videos yet." : "No videos match this filter."}
                  </td>
                </tr>
              ) : (
                filteredVideos.map((video) => {
                  const phase = rowPhase[video.videoId] || "idle";
                  const busy =
                    phase === "detecting" ||
                    phase === "creating" ||
                    phase === "analyzing" ||
                    phase === "opening";
                  const statusLabel = rowStatusLabel(phase, rowError[video.videoId]);

                  return (
                    <tr key={video.videoId} className="border-t border-line/70">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/youtube/videos/${video.videoId}?range=${analytics.rangeDays}`}
                          className={`flex min-w-[12rem] items-center gap-3 ${adminLinkClass}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-10 w-[4.5rem] shrink-0 rounded-sm object-cover"
                          />
                          <span className="line-clamp-2 font-medium text-ink">{video.title}</span>
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">{video.publishedAt}</td>
                      <td className="px-4 py-3 text-muted">{video.formatLabel}</td>
                      <td className="px-4 py-3">{video.viewCount}</td>
                      <td className="hidden px-4 py-3 lg:table-cell">{video.likeCount}</td>
                      <td className="hidden px-4 py-3 xl:table-cell">{video.commentCount}</td>
                      {analyticsConnected ? (
                        <>
                          <td className="px-4 py-3">{video.analytics?.periodViews ?? "—"}</td>
                          <td className="hidden px-4 py-3 lg:table-cell">{video.analytics?.watchTime ?? "—"}</td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            {video.analytics?.averageViewPercentage ?? "—"}
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            {video.analytics?.subscribersGained ?? "—"}
                          </td>
                        </>
                      ) : (
                        <td className="hidden px-4 py-3 md:table-cell">{video.views7d}</td>
                      )}
                      <td className="px-4 py-3">
                        {video.recipe ? (
                          <Link
                            href={`/admin/recipes/${video.recipe.id}`}
                            className={`line-clamp-2 ${adminLinkClass}`}
                          >
                            {video.recipe.title}
                          </Link>
                        ) : busy || phase === "confirm" ? (
                          <p className="text-xs text-muted" role="status">
                            {statusLabel || "Working…"}
                          </p>
                        ) : canCreateRecipes ? (
                          <div className="space-y-1">
                            {phase === "error" && rowError[video.videoId] ? (
                              <p className="text-xs text-terracotta" role="alert">
                                {rowError[video.videoId]}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              className={compactLinkBtn}
                              disabled={busy}
                              onClick={() => void startCreate(video.videoId)}
                            >
                              + Create recipe
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted">No recipe</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${statusClass(video.status)}`}>
                        {video.status}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
                <span className="mt-1 block text-xs">Confidence: Medium</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {confirm.message || "Recipe type could not be determined confidently."}
              </p>
            )}
            {confirm.reasoning ? <p className="mt-2 text-xs text-muted">{confirm.reasoning}</p> : null}
            <label className="mt-4 grid gap-1 text-sm">
              <span className="text-xs font-semibold text-ink">Recipe type</span>
              <select
                value={confirm.typeId}
                onChange={(event) =>
                  setConfirm((current) =>
                    current ? { ...current, typeId: event.target.value } : current,
                  )
                }
                className="h-10 rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
              >
                <option value="">Select recipe type…</option>
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
                className={`${adminPrimaryButtonClass} ${adminFocusRing} h-10 px-4`}
                disabled={!confirm.typeId}
                onClick={() => {
                  const typeChanged =
                    !confirm.typeName ||
                    recipeTypes.find((type) => type.id === confirm.typeId)?.name !== confirm.typeName;
                  void createWithType(
                    confirm.videoId,
                    confirm.typeId,
                    typeChanged || confirm.confidence === "LOW" ? "manual" : "ai",
                    confirm.confidence,
                  );
                }}
              >
                Create draft recipe
              </button>
              <button
                type="button"
                className={`${secondaryBtn} ${adminFocusRing}`}
                onClick={() => {
                  setPhase(confirm.videoId, "idle");
                  setConfirm(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <h2 className="font-serif text-xl text-ink">Content health</h2>
        {healthSummary.issues.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No issues detected.</p>
        ) : (
          <div className="mt-4 rounded-sm border border-line bg-paper px-4 py-4">
            <ul className="space-y-1 text-sm text-ink">
              {healthSummary.videosNeedRecipes > 0 ? (
                <li>{healthSummary.videosNeedRecipes} YouTube videos need recipes</li>
              ) : null}
              {healthSummary.recipesNeedVideos > 0 ? (
                <li>{healthSummary.recipesNeedVideos} recipes need YouTube videos</li>
              ) : null}
              {healthSummary.metadataIssues > 0 ? (
                <li>{healthSummary.metadataIssues} metadata issues</li>
              ) : null}
            </ul>
            <button
              type="button"
              className={`mt-3 text-sm font-semibold ${adminLinkClass}`}
              onClick={() => setHealthOpen((open) => !open)}
            >
              {healthOpen ? "Hide issues" : "Review issues"}
            </button>
            {healthOpen ? (
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {healthSummary.issues.map((issue) => (
                  <li key={issue.id} className="rounded-sm border border-line/70 bg-sand/20 px-3 py-2 text-sm">
                    {issue.href ? (
                      <Link href={issue.href} className={adminLinkClass}>
                        {issue.label}
                      </Link>
                    ) : (
                      issue.label
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>
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

function SummaryCard({
  label,
  value,
  note,
  trend,
}: {
  label: string;
  value: string;
  note?: string;
  trend?: string | null;
}) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">{label}</p>
      <p className="mt-2 font-serif text-2xl text-ink">{value}</p>
      {trend ? <p className="mt-1 text-xs font-semibold text-olive">{trend}</p> : null}
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line/80 bg-sand/20 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
