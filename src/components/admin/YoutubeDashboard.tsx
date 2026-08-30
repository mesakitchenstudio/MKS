"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { syncYoutubeAction } from "@/app/admin/actions";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";
import type { YouTubeVideoRowStatus } from "@/lib/youtube-data/types";
import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import {
  parseYoutubeDashboardFilter,
  youtubeDashboardFilterQueryValue,
  type YoutubeDashboardVideoFilter,
} from "@/lib/youtube-data/video-format";

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
  canCreateRecipes = false,
  recipeTypes = [],
  initialFilter = "all",
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
  canCreateRecipes?: boolean;
  recipeTypes?: RecipeTypeOption[];
  initialFilter?: YoutubeDashboardVideoFilter | string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
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

  function updateFilter(next: YoutubeDashboardVideoFilter) {
    setFilter(next);
    const query = youtubeDashboardFilterQueryValue(next);
    const url = query ? `/admin/youtube?filter=${query}` : "/admin/youtube";
    router.replace(url, { scroll: false });
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

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">YouTube</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Channel performance and recipe video coverage.
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
              Refreshes channel, video metadata, thumbnails and public statistics. Recipe content is
              not changed.
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Subscribers"
              value={channel.subscriberCount}
              note={
                channel.hiddenSubscriberCount
                  ? "Public count may be hidden or rounded by YouTube."
                  : "Public count (may be rounded by YouTube)."
              }
              trend={formatTrend(channel.trendSubscribers7d, "subscribers / 7 days")}
            />
            <SummaryCard label="Total channel views" value={channel.viewCount} trend={formatTrend(channel.trendViews7d, "views / 7 days")} />
            <SummaryCard label="Public videos" value={channel.videoCount} />
            <SummaryCard label="Last synced" value={channel.lastSyncedAt} note={channel.lastSyncStatus === "error" ? channel.lastSyncError : undefined} />
          </section>

          {!channel.trendViews7d && !channel.trendSubscribers7d ? (
            <p className="text-sm text-muted">Trend available after more snapshots are collected.</p>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Videos linked to recipes" value={String(summary.linkedVideos)} />
            <MiniStat label="Videos without recipes" value={String(summary.videosWithoutRecipes)} />
            <MiniStat label="Recipes with YouTube videos" value={String(summary.recipesWithVideo)} />
            <MiniStat label="Recipes without YouTube videos" value={String(summary.recipesWithoutVideo)} />
          </section>
        </>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">Recent videos</h2>
            <p className="mt-1 text-xs text-muted">
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
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Views</th>
                <th className="px-4 py-3 font-medium">Likes</th>
                <th className="px-4 py-3 font-medium">Comments</th>
                <th className="px-4 py-3 font-medium">7-day views</th>
                <th className="px-4 py-3 font-medium">Recipe</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-muted">
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
                          href={`/admin/youtube/videos/${video.videoId}`}
                          className={`flex min-w-[14rem] items-center gap-3 ${adminLinkClass}`}
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
                      <td className="px-4 py-3 text-muted">{video.publishedAt}</td>
                      <td className="px-4 py-3 text-muted">{video.formatLabel}</td>
                      <td className="px-4 py-3">{video.viewCount}</td>
                      <td className="px-4 py-3">{video.likeCount}</td>
                      <td className="px-4 py-3">{video.commentCount}</td>
                      <td className="px-4 py-3">{video.views7d}</td>
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
