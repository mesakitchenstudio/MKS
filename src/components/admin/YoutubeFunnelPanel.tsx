"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import type { YoutubeFunnelDashboard } from "@/lib/youtube-funnel/types";
import { ANALYTICS_RANGE_DAYS, type AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

type SortKey =
  | "pageviews"
  | "playRate"
  | "watchCtr"
  | "subscribeCtr"
  | "videoPlays"
  | "chapterClicks";

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function YoutubeFunnelPanel({
  funnel,
  filterQuery,
}: {
  funnel: YoutubeFunnelDashboard;
  filterQuery?: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("pageviews");

  const sortedRecipes = useMemo(() => {
    const rows = [...funnel.recipes];
    rows.sort((a, b) => {
      const av =
        sortKey === "pageviews"
          ? a.pageviews
          : sortKey === "videoPlays"
            ? a.videoPlays
            : sortKey === "chapterClicks"
              ? a.chapterClicks
              : sortKey === "playRate"
                ? a.playRate ?? -1
                : sortKey === "watchCtr"
                  ? a.watchCtr ?? -1
                  : a.subscribeCtr ?? -1;
      const bv =
        sortKey === "pageviews"
          ? b.pageviews
          : sortKey === "videoPlays"
            ? b.videoPlays
            : sortKey === "chapterClicks"
              ? b.chapterClicks
              : sortKey === "playRate"
                ? b.playRate ?? -1
                : sortKey === "watchCtr"
                  ? b.watchCtr ?? -1
                  : b.subscribeCtr ?? -1;
      return bv - av || a.recipeTitle.localeCompare(b.recipeTitle);
    });
    return rows;
  }, [funnel.recipes, sortKey]);

  function updateRange(days: AnalyticsRangeDays) {
    const params = new URLSearchParams();
    params.set("view", "funnel");
    if (filterQuery) params.set("filter", filterQuery);
    if (days !== 28) params.set("range", String(days));
    const qs = params.toString();
    router.replace(qs ? `/admin/youtube?${qs}` : "/admin/youtube?view=funnel", { scroll: false });
  }

  const s = funnel.summaryDisplay;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">Website funnel</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            How recipe pages lead to embedded plays, Watch on YouTube clicks, and Subscribe CTA
            clicks. These are website interactions — not confirmed YouTube views or subscriptions.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-xs">
          {ANALYTICS_RANGE_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                funnel.rangeDays === days ? "bg-sand text-ink" : "text-muted hover:text-ink"
              } ${adminFocusRing}`}
              onClick={() => updateRange(days)}
            >
              Last {days} days
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs leading-5 text-muted">{funnel.trackingNote}</p>

      <section className="rounded-sm border border-line bg-paper px-4 py-4">
        <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Funnel overview
        </h3>
        <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
          <li className="rounded-sm bg-cream/60 px-2.5 py-1.5">
            Recipe views <span className="font-semibold">{s.linkedRecipePageviews}</span>
          </li>
          <li className="text-muted" aria-hidden>
            →
          </li>
          <li className="rounded-sm bg-cream/60 px-2.5 py-1.5">
            Video plays <span className="font-semibold">{s.videoPlays}</span>{" "}
            <span className="text-muted">({s.playRate})</span>
          </li>
          <li className="text-muted" aria-hidden>
            →
          </li>
          <li className="rounded-sm bg-cream/60 px-2.5 py-1.5">
            Watch on YouTube <span className="font-semibold">{s.watchOnYoutubeClicks}</span>{" "}
            <span className="text-muted">({s.watchOnYoutubeCtr})</span>
          </li>
          <li className="text-muted" aria-hidden>
            →
          </li>
          <li className="rounded-sm bg-cream/60 px-2.5 py-1.5">
            Subscribe CTA <span className="font-semibold">{s.subscribeCtaClicks}</span>{" "}
            <span className="text-muted">({s.subscribeCtr})</span>
          </li>
          <li className="text-muted" aria-hidden>
            →
          </li>
          <li className="rounded-sm bg-cream/60 px-2.5 py-1.5">
            Continued viewing <span className="font-semibold">{s.continuedViewingSessions}</span>{" "}
            <span className="text-muted">({s.continuedViewingRate})</span>
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          Rates use unique anonymous visitors with a linked-recipe pageview in the period as the
          denominator (except continued viewing: visitors with ≥1 video interaction).
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Linked recipe pageviews" value={s.linkedRecipePageviews} />
        <StatCard label="Embedded video plays" value={s.videoPlays} note={`Play rate ${s.playRate}`} />
        <StatCard label="Chapter clicks" value={s.chapterClicks} />
        <StatCard
          label="Watch on YouTube clicks"
          value={s.watchOnYoutubeClicks}
          note={`CTR ${s.watchOnYoutubeCtr}`}
        />
        <StatCard
          label="Subscribe CTA clicks"
          value={s.subscribeCtaClicks}
          note={`Subscribe CTR ${s.subscribeCtr}`}
        />
        <StatCard
          label="Continued viewing sessions"
          value={s.continuedViewingSessions}
          note={`Rate ${s.continuedViewingRate}`}
        />
      </section>

      {funnel.placements.length > 0 ? (
        <section>
          <h3 className="font-serif text-lg text-ink">CTA placement</h3>
          <p className="mt-1 text-sm text-muted">Where Watch on YouTube and Subscribe CTA clicks occur.</p>
          <div className="mt-3 overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className={adminTableHeadClass}>
                  <th className="px-4 py-3 font-medium">Placement</th>
                  <th className="px-4 py-3 font-medium">Watch on YouTube</th>
                  <th className="px-4 py-3 font-medium">Subscribe CTA</th>
                </tr>
              </thead>
              <tbody>
                {funnel.placements.map((row) => (
                  <tr key={row.placement} className="border-t border-line/70">
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3">{row.watchOnYoutubeClicks}</td>
                    <td className="px-4 py-3">{row.subscribeCtaClicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg text-ink">Per-recipe performance</h3>
            <p className="mt-1 text-sm text-muted">Published recipes with a linked YouTube video.</p>
          </div>
          <label className="text-xs text-muted">
            Sort{" "}
            <select
              className={`ml-1 rounded-sm border border-line bg-paper px-2 py-1.5 text-sm text-ink ${adminFocusRing}`}
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="pageviews">Pageviews</option>
              <option value="videoPlays">Video plays</option>
              <option value="playRate">Play rate</option>
              <option value="watchCtr">YouTube CTR</option>
              <option value="subscribeCtr">Subscribe CTR</option>
              <option value="chapterClicks">Chapter clicks</option>
            </select>
          </label>
        </div>
        <div className="mt-3 overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={adminTableHeadClass}>
                <th className="px-4 py-3 font-medium">Recipe</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Video</th>
                <th className="px-4 py-3 font-medium">Pageviews</th>
                <th className="px-4 py-3 font-medium">Plays</th>
                <th className="px-4 py-3 font-medium">Play rate</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Chapters</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Watch YT</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">YT CTR</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Sub CTA</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Sub CTR</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecipes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-muted">
                    No linked recipes yet.
                  </td>
                </tr>
              ) : (
                sortedRecipes.map((row) => (
                  <tr key={row.recipeId} className="border-t border-line/70">
                    <td className="px-4 py-3">
                      <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                        {row.recipeTitle}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Link
                        href={`/admin/youtube/videos/${row.youtubeVideoId}?range=${funnel.rangeDays}`}
                        className={adminLinkClass}
                      >
                        {row.youtubeVideoId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.pageviews.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3">{row.videoPlays.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3">{row.playRateLabel}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {row.chapterClicks.toLocaleString("en-US")}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {row.watchOnYoutubeClicks.toLocaleString("en-US")}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{row.watchCtrLabel}</td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      {row.subscribeCtaClicks.toLocaleString("en-US")}
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">{row.subscribeCtrLabel}</td>
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
