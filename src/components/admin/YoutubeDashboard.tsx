"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncYoutubeAction } from "@/app/admin/actions";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";
import type { YouTubeVideoRowStatus } from "@/lib/youtube-data/types";

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
  recipe: { id: string; slug: string; title: string } | null;
  status: YouTubeVideoRowStatus;
};

type HealthIssue = {
  id: string;
  label: string;
  href?: string;
  kind: "video" | "recipe";
};

function statusClass(status: YouTubeVideoRowStatus) {
  if (status === "Healthy") return "text-olive";
  if (status === "No recipe") return "text-muted";
  return "text-terracotta";
}

function formatTrend(value: string | null, label: string) {
  if (!value) return null;
  return `${value} ${label}`;
}

export function YoutubeDashboard({
  channel,
  summary,
  videos,
  healthIssues,
  canSync,
}: {
  channel: ChannelSummary | null;
  summary: {
    linkedVideos: number;
    videosWithoutRecipes: number;
    recipesWithVideo: number;
    recipesWithoutVideo: number;
  };
  videos: VideoRow[];
  healthIssues: HealthIssue[];
  canSync: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");

  function onSync() {
    setSyncMessage("");
    setSyncError("");
    startTransition(async () => {
      const result = await syncYoutubeAction();
      if (result.ok) {
        setSyncMessage(
          `Synced ${result.videosSynced} videos${result.snapshotCreated ? " and recorded a snapshot" : ""}.`,
        );
        router.refresh();
      } else {
        setSyncError(result.error || "YouTube sync failed.");
      }
    });
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
          <button
            type="button"
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            disabled={pending}
            onClick={onSync}
          >
            {pending ? "Syncing…" : "Sync YouTube"}
          </button>
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
            <p className="mt-2">Use Sync YouTube to fetch Mesa Kitchen Studio channel metadata.</p>
          ) : (
            <p className="mt-2">Ask an owner to run the first sync.</p>
          )}
          {channel === null && syncError ? null : null}
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
        <h2 className="font-serif text-xl text-ink">Recent videos</h2>
        <div className="mt-4 overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={adminTableHeadClass}>
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Views</th>
                <th className="px-4 py-3 font-medium">Likes</th>
                <th className="px-4 py-3 font-medium">Comments</th>
                <th className="px-4 py-3 font-medium">7-day views</th>
                <th className="px-4 py-3 font-medium">Recipe</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-muted">
                    No synced videos yet.
                  </td>
                </tr>
              ) : (
                videos.map((video) => (
                  <tr key={video.videoId} className="border-t border-line/70">
                    <td className="px-4 py-3">
                      <Link href={`/admin/youtube/videos/${video.videoId}`} className={`flex min-w-[14rem] items-center gap-3 ${adminLinkClass}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={video.thumbnailUrl} alt="" className="h-10 w-[4.5rem] shrink-0 rounded-sm object-cover" />
                        <span className="line-clamp-2 font-medium text-ink">{video.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{video.publishedAt}</td>
                    <td className="px-4 py-3">{video.viewCount}</td>
                    <td className="px-4 py-3">{video.likeCount}</td>
                    <td className="px-4 py-3">{video.commentCount}</td>
                    <td className="px-4 py-3">{video.views7d}</td>
                    <td className="px-4 py-3">
                      {video.recipe ? (
                        <Link href={`/admin/recipes/${video.recipe.id}`} className={adminLinkClass}>
                          Linked
                        </Link>
                      ) : (
                        <span className="text-muted">Not linked</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 font-semibold ${statusClass(video.status)}`}>{video.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink">Content health</h2>
        {healthIssues.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No issues detected.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {healthIssues.map((issue) => (
              <li key={issue.id} className="rounded-sm border border-line bg-paper px-4 py-3 text-sm">
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
