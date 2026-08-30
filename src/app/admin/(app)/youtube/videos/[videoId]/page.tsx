import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateRecipeFromYoutubeVideo } from "@/components/admin/CreateRecipeFromYoutubeVideo";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { canAccess } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadYoutubeVideoDetail } from "@/lib/youtube-data/dashboard";
import { formatChapterTime, formatTimestampInput } from "@/lib/youtube-metadata-editor";
import { ANALYTICS_RANGE_DAYS, parseAnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";
import { loadVideoFunnelChapters } from "@/lib/youtube-funnel/load";

export const dynamic = "force-dynamic";

export default async function AdminYoutubeVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const admin = await requireAccess("youtube");
  const canCreateRecipes = canAccess(admin.role, "content");
  const { videoId } = await params;
  const { range } = await searchParams;
  const rangeDays = parseAnalyticsRangeDays(range);
  const db = getDb();
  const [detail, recipeTypes, funnelChapters] = await Promise.all([
    loadYoutubeVideoDetail(videoId, { analyticsRangeDays: rangeDays }),
    canCreateRecipes
      ? db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    loadVideoFunnelChapters({ youtubeVideoId: videoId, analyticsRangeDays: rangeDays }),
  ]);
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/youtube" className={`text-sm ${adminLinkClass}`}>
          ← YouTube
        </Link>
        <h1 className="mt-3 font-serif text-[2rem] leading-tight text-ink md:text-[2.25rem]">
          {detail.title}
        </h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={detail.thumbnailUrl}
          alt=""
          className="aspect-video w-full rounded-sm border border-line object-cover"
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Meta label="YouTube video ID" value={detail.videoId} mono />
          <Meta label="Published" value={detail.publishedAt} />
          <Meta label="Duration" value={detail.durationDisplay || "—"} />
          <Meta label="Public views" value={detail.viewCount} />
          <Meta label="Public likes" value={detail.likeCount} />
          <Meta label="Public comments" value={detail.commentCount} />
          <Meta label="Privacy" value={detail.privacyStatus || "—"} />
          <Meta label="Embeddable" value={detail.embeddable ? "Yes" : "No"} />
          <Meta
            label="Linked recipe"
            value={
              detail.recipe ? (
                <Link href={`/admin/recipes/${detail.recipe.id}`} className={adminLinkClass}>
                  {detail.recipe.title}
                </Link>
              ) : (
                "Not linked"
              )
            }
          />
        </dl>
      </div>

      <section className="rounded-sm border border-line bg-paper px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink">YouTube Analytics</h2>
            <p className="mt-1 text-xs text-muted">
              OAuth Analytics metrics for the selected period — separate from public counter history.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-xs">
            {ANALYTICS_RANGE_DAYS.map((days) => (
              <Link
                key={days}
                href={`/admin/youtube/videos/${detail.videoId}?range=${days}`}
                className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                  detail.analytics.rangeDays === days ? "bg-sand text-ink" : "text-muted hover:text-ink"
                } ${adminFocusRing}`}
              >
                Last {days} days
              </Link>
            ))}
          </div>
        </div>

        {!detail.analytics.connection.connected ? (
          <p className="mt-4 text-sm text-muted">
            YouTube Analytics is not connected. An owner can connect it from the YouTube dashboard.
            Public metadata on this page still works.
          </p>
        ) : (
          <>
            {detail.analytics.videoMetricsNotice ? (
              <p className="mt-4 text-sm text-terracotta" role="alert">
                {detail.analytics.videoMetricsNotice}
              </p>
            ) : null}
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Meta label="Period views" value={detail.analytics.metrics.views} />
              <Meta label="Watch time" value={detail.analytics.metrics.watchTime} />
              <Meta label="Average view duration" value={detail.analytics.metrics.averageViewDuration} />
              <Meta
                label="Average percentage viewed"
                value={detail.analytics.metrics.averageViewPercentage}
              />
              <Meta label="Subscribers gained" value={detail.analytics.metrics.subscribersGained} />
              <Meta label="Subscribers lost" value={detail.analytics.metrics.subscribersLost} />
              <Meta label="Shares" value={detail.analytics.metrics.shares} />
              <Meta label="Likes (Analytics)" value={detail.analytics.metrics.likes} />
            </dl>
          </>
        )}
      </section>

      <section className="rounded-sm border border-line bg-paper px-4 py-4">
        <h2 className="font-serif text-lg text-ink">Website chapter clicks</h2>
        <p className="mt-1 text-xs text-muted">
          Clicks on recipe-page chapter/timestamp controls for this video (last {funnelChapters.rangeDays}{" "}
          days). Separate from YouTube description chapters.
        </p>
        {funnelChapters.chapters.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No website chapter clicks in this period yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className={adminTableHeadClass}>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Chapter</th>
                  <th className="px-4 py-3 font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {funnelChapters.chapters.map((row, index) => (
                  <tr
                    key={`${row.chapterIndex ?? index}-${row.chapterTimeSeconds ?? 0}-${row.chapterLabel}`}
                    className="border-t border-line/70"
                  >
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {typeof row.chapterTimeSeconds === "number"
                        ? formatChapterTime(row.chapterTimeSeconds)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{row.chapterLabel}</td>
                    <td className="px-4 py-3">{row.clicksLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!detail.recipe && canCreateRecipes ? (
        <section className="rounded-sm border border-line bg-paper px-4 py-4">
          <h2 className="font-serif text-lg text-ink">Create Mesa recipe</h2>
          <p className="mt-1 text-sm text-muted">
            Detect the recipe type, create a draft linked to this video, and run AI analysis for review.
          </p>
          <div className="mt-4">
            <CreateRecipeFromYoutubeVideo
              videoId={detail.videoId}
              recipeTypes={recipeTypes}
            />
          </div>
        </section>
      ) : null}

      {!detail.recipe && !canCreateRecipes ? (
        <p className="text-sm text-muted">This video is not linked to a Mesa recipe.</p>
      ) : null}

      {detail.tags.length > 0 ? (
        <section>
          <h2 className="font-serif text-lg text-ink">Tags</h2>
          <p className="mt-2 text-sm text-muted">{detail.tags.join(", ")}</p>
        </section>
      ) : null}

      {detail.descriptionChapters.length > 0 ? (
        <section>
          <h2 className="font-serif text-lg text-ink">YouTube description chapters</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {detail.descriptionChapters.map((chapter) => (
              <li key={`${chapter.time}-${chapter.label}`}>
                <span className="font-mono text-muted">{formatTimestampInput(chapter.time)}</span>{" "}
                {chapter.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-serif text-lg text-ink">Description</h2>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-sand/20 p-4 text-sm text-ink">
          {detail.description || "—"}
        </pre>
      </section>

      <section>
        <h2 className="font-serif text-lg text-ink">Public counter history</h2>
        <p className="mt-1 text-xs text-muted">
          PUBLIC COUNTER HISTORY — snapshots of public Data API view/like/comment counts stored by
          Mesa. This is not YouTube Analytics.
        </p>
        <div className="mt-4 overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={adminTableHeadClass}>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Views</th>
                <th className="px-4 py-3 font-medium">Likes</th>
                <th className="px-4 py-3 font-medium">Comments</th>
                <th className="px-4 py-3 font-medium">Views gained</th>
              </tr>
            </thead>
            <tbody>
              {detail.history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted">
                    No snapshots yet. Sync again after the snapshot interval to build history.
                  </td>
                </tr>
              ) : (
                detail.history.map((row) => (
                  <tr key={`${row.recordedAt.date}-${row.recordedAt.time}`} className="border-t border-line/70">
                    <td className="px-4 py-3">
                      <div>{row.recordedAt.date}</div>
                      {row.recordedAt.time ? (
                        <div className="text-xs text-muted">{row.recordedAt.time}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.viewCount}</td>
                    <td className="px-4 py-3">{row.likeCount}</td>
                    <td className="px-4 py-3">{row.commentCount}</td>
                    <td className="px-4 py-3">{row.viewsGained}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-olive">{label}</dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
