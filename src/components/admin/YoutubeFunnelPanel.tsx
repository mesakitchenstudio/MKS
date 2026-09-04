"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import {
  compactLowSampleNotice,
  formatContinuedViewingOutcome,
  formatRecipeVisitorOutcome,
  FUNNEL_METHODOLOGY,
  isFunnelLowSample,
  quietZeroVisitorOutcomeLabel,
  RECIPE_MULTI_VIDEO_VISITORS_HELP,
  RECIPE_MULTI_VIDEO_VISITORS_LABEL,
  RECIPE_PERFORMANCE_INTRO,
  RECIPE_PERFORMANCE_MULTI_VIDEO_NOTE,
} from "@/lib/youtube-funnel/funnel-display";
import type { YoutubeFunnelDashboard } from "@/lib/youtube-funnel/types";
import { ANALYTICS_RANGE_DAYS, type AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

type RecipeFilter = "all" | "has-video" | "no-video";

function outcomePrimary(
  numerator: number,
  denominator: number,
): { fractionLabel: string; rateLabel: string | null; primary: string } {
  const outcome = formatRecipeVisitorOutcome(numerator, denominator);
  const primary = outcome.rateLabel
    ? `${outcome.fractionLabel} · ${outcome.rateLabel}`
    : outcome.fractionLabel;
  return { fractionLabel: outcome.fractionLabel, rateLabel: outcome.rateLabel, primary };
}

export function YoutubeFunnelPanel({
  funnel,
  filterQuery,
}: {
  funnel: YoutubeFunnelDashboard;
  filterQuery?: string;
}) {
  const router = useRouter();
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>("all");

  const summary = funnel.summary;
  const visitorBase = summary.uniquePageviewVisitors;
  const lowSample = isFunnelLowSample(visitorBase);

  const play = outcomePrimary(summary.uniquePlayVisitors, visitorBase);
  const watch = outcomePrimary(summary.uniqueWatchOnYoutubeVisitors, visitorBase);
  const subscribe = outcomePrimary(summary.uniqueSubscribeVisitors, visitorBase);
  const continued = formatContinuedViewingOutcome(
    summary.continuedViewingSessions,
    summary.videoInteractionSessions,
  );
  const continuedPrimary = continued.shortFraction
    ? continued.rateLabel
      ? `${continued.shortFraction} · ${continued.rateLabel}`
      : continued.shortFraction
    : continued.fractionLabel;

  const filteredRecipes = useMemo(() => {
    if (recipeFilter === "no-video") return [];
    return funnel.recipes;
  }, [funnel.recipes, recipeFilter]);

  const showNoVideoSection =
    recipeFilter !== "has-video" && funnel.noVideoTraffic.length > 0;

  function updateRange(days: AnalyticsRangeDays) {
    const params = new URLSearchParams();
    params.set("view", "funnel");
    if (filterQuery) params.set("filter", filterQuery);
    if (days !== 28) params.set("range", String(days));
    const qs = params.toString();
    router.replace(qs ? `/admin/youtube?${qs}` : "/admin/youtube?view=funnel", { scroll: false });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1.5">
          <p className="text-sm text-muted">{FUNNEL_METHODOLOGY.intro}</p>
          <p className="text-xs text-muted">
            {funnel.startDate} → {funnel.endDate} UTC (includes today)
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-sm border border-line/70 p-1 text-xs"
          role="group"
          aria-label="Date range"
        >
          {ANALYTICS_RANGE_DAYS.map((days) => {
            const selected = funnel.rangeDays === days;
            return (
              <button
                key={days}
                type="button"
                aria-pressed={selected}
                className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                  selected ? "bg-sand text-ink" : "text-muted hover:text-ink"
                } ${adminFocusRing}`}
                onClick={() => updateRange(days)}
              >
                {days} days
              </button>
            );
          })}
        </div>
      </div>

      {lowSample ? (
        <p className="text-sm text-muted" role="status">
          {compactLowSampleNotice(visitorBase)}
        </p>
      ) : null}

      <p className="text-sm text-ink">
        {visitorBase.toLocaleString("en-US")} unique visitor{visitorBase === 1 ? "" : "s"} ·{" "}
        {summary.linkedRecipePageviews.toLocaleString("en-US")} linked-recipe pageviews
      </p>

      <section aria-labelledby="funnel-outcomes-heading">
        <h2 id="funnel-outcomes-heading" className="font-serif text-lg text-ink">
          Independent outcomes
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-5 border-y border-line/70 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <div aria-label={`Played embedded video: ${play.fractionLabel}`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Played
            </p>
            <p className="mt-1.5 font-serif text-xl text-ink">{play.primary}</p>
            <p className="mt-1 text-sm text-muted">
              {summary.videoPlays.toLocaleString("en-US")} plays
            </p>
            {summary.chapterClicks > 0 ? (
              <p className="mt-1.5 text-xs text-muted">
                {summary.chapterClicks.toLocaleString("en-US")} chapter clicks
                {summary.uniqueChapterVisitors > 0
                  ? ` · ${summary.uniqueChapterVisitors.toLocaleString("en-US")} visitor${summary.uniqueChapterVisitors === 1 ? "" : "s"}`
                  : ""}
              </p>
            ) : null}
          </div>

          <div aria-label={`Watch on YouTube: ${watch.fractionLabel}`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Watch on YouTube
            </p>
            <p className="mt-1.5 font-serif text-xl text-ink">{watch.primary}</p>
            <p className="mt-1 text-sm text-muted">
              {summary.watchOnYoutubeClicks.toLocaleString("en-US")} clicks
            </p>
          </div>

          <div aria-label={`Subscribe CTA: ${subscribe.fractionLabel}`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Subscribe CTA
            </p>
            <p className="mt-1.5 font-serif text-xl text-ink">{subscribe.primary}</p>
            <p className="mt-1 text-sm text-muted">
              {summary.subscribeCtaClicks.toLocaleString("en-US")} Subscribe CTA clicks
            </p>
          </div>

          <div aria-label={`Continued viewing: ${continued.fractionLabel}`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Continued viewing
            </p>
            <p className="mt-1.5 font-serif text-xl text-ink">{continuedPrimary}</p>
            {continued.denominatorNote ? (
              <p className="mt-0.5 text-xs text-muted">{continued.denominatorNote}</p>
            ) : null}
            <p className="mt-1 text-sm text-muted">{continued.headline}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="funnel-recipes-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="funnel-recipes-heading" className="font-serif text-lg text-ink">
              Recipe performance
            </h2>
            <p className="mt-1 text-sm text-muted">{RECIPE_PERFORMANCE_INTRO}</p>
            <p className="mt-0.5 text-xs text-muted">{RECIPE_PERFORMANCE_MULTI_VIDEO_NOTE}</p>
          </div>
          <div
            className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs"
            role="group"
            aria-label="Recipe filter"
          >
            {(
              [
                ["all", "All"],
                ["has-video", "Has video"],
                ["no-video", "No video"],
              ] as const
            ).map(([value, label]) => {
              const selected = recipeFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  className={`min-h-[44px] rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                    selected ? "bg-sand text-ink" : "text-muted hover:text-ink"
                  } ${adminFocusRing}`}
                  onClick={() => setRecipeFilter(value)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {recipeFilter !== "no-video" ? (
          <>
            <div className="hidden overflow-x-auto border-y border-line/70 md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className={adminTableHeadClass}>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Recipe
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Visitors
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Played
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Watch on YouTube
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Subscribe CTA
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      {RECIPE_MULTI_VIDEO_VISITORS_LABEL}
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecipes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-muted">
                        No linked recipes with traffic in this period.
                      </td>
                    </tr>
                  ) : (
                    filteredRecipes.map((row) => {
                      const zeroTraffic = row.uniquePageviewVisitors === 0;
                      const mutedCell = zeroTraffic ? "text-muted" : undefined;
                      return (
                        <tr key={row.recipeId} className="border-t border-line/70">
                          <td className="px-3 py-3">
                            <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                              {row.recipeTitle}
                            </Link>
                          </td>
                          <td className={`px-3 py-3 ${mutedCell ?? ""}`}>
                            {row.uniquePageviewVisitors.toLocaleString("en-US")}
                          </td>
                          <td className={`px-3 py-3 ${mutedCell ?? ""}`}>
                            {quietZeroVisitorOutcomeLabel(row.playOutcomeLabel)}
                          </td>
                          <td className={`px-3 py-3 ${mutedCell ?? ""}`}>
                            {quietZeroVisitorOutcomeLabel(row.watchOutcomeLabel)}
                          </td>
                          <td className={`px-3 py-3 ${mutedCell ?? ""}`}>
                            {quietZeroVisitorOutcomeLabel(row.subscribeOutcomeLabel)}
                          </td>
                          <td className={`px-3 py-3 ${mutedCell ?? ""}`}>
                            {quietZeroVisitorOutcomeLabel(row.multiVideoVisitorsLabel)}
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={`/admin/youtube/videos/${row.youtubeVideoId}?range=${funnel.rangeDays}`}
                              className={`text-xs font-semibold ${adminLinkClass}`}
                              aria-label={`View video for ${row.recipeTitle}`}
                            >
                              View video
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line/70 border-y border-line/70 md:hidden">
              {filteredRecipes.length === 0 ? (
                <li className="px-1 py-6 text-sm text-muted">
                  No linked recipes with traffic in this period.
                </li>
              ) : (
                filteredRecipes.map((row) => {
                  const zeroTraffic = row.uniquePageviewVisitors === 0;
                  const mutedDd = zeroTraffic ? "text-muted" : undefined;
                  return (
                    <li key={row.recipeId} className="px-1 py-3 text-sm">
                      <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                        <span className="font-semibold text-ink">{row.recipeTitle}</span>
                      </Link>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-muted">Visitors</dt>
                        <dd className={mutedDd}>
                          {row.uniquePageviewVisitors.toLocaleString("en-US")}
                        </dd>
                        <dt className="text-muted">Played</dt>
                        <dd className={mutedDd}>
                          {quietZeroVisitorOutcomeLabel(row.playOutcomeLabel)}
                        </dd>
                        <dt className="text-muted">Watch on YouTube</dt>
                        <dd className={mutedDd}>
                          {quietZeroVisitorOutcomeLabel(row.watchOutcomeLabel)}
                        </dd>
                        <dt className="text-muted">Subscribe CTA</dt>
                        <dd className={mutedDd}>
                          {quietZeroVisitorOutcomeLabel(row.subscribeOutcomeLabel)}
                        </dd>
                        <dt className="text-muted">{RECIPE_MULTI_VIDEO_VISITORS_LABEL}</dt>
                        <dd className={mutedDd}>
                          {quietZeroVisitorOutcomeLabel(row.multiVideoVisitorsLabel)}
                        </dd>
                      </dl>
                      <Link
                        href={`/admin/youtube/videos/${row.youtubeVideoId}?range=${funnel.rangeDays}`}
                        className={`mt-2 inline-block text-xs font-semibold ${adminLinkClass}`}
                        aria-label={`View video for ${row.recipeTitle}`}
                      >
                        View video
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        ) : null}

        {showNoVideoSection ? (
          <div className="pt-3">
            <h3 className="text-sm font-semibold text-ink">Recipes with traffic but no video</h3>
            <p className="mt-1 text-xs text-muted">
              Published recipes receiving visitors without a linked YouTube video.
            </p>
            <div className="mt-3 hidden overflow-x-auto border-y border-line/70 md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className={adminTableHeadClass}>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Recipe
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Visitors
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Pageviews
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Video
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.noVideoTraffic.map((row) => (
                    <tr key={row.recipeId} className="border-t border-line/70">
                      <td className="px-3 py-3">
                        <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                          {row.recipeTitle}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {row.uniquePageviewVisitors.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-3">{row.pageviews.toLocaleString("en-US")}</td>
                      <td className="px-3 py-3 text-muted">No video</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/recipes/${row.recipeId}`}
                          className={`text-xs font-semibold ${adminLinkClass}`}
                        >
                          Attach video
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 divide-y divide-line/70 border-y border-line/70 md:hidden">
              {funnel.noVideoTraffic.map((row) => (
                <li key={row.recipeId} className="px-1 py-3 text-sm">
                  <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                    <span className="font-semibold text-ink">{row.recipeTitle}</span>
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    {row.uniquePageviewVisitors.toLocaleString("en-US")} visitors ·{" "}
                    {row.pageviews.toLocaleString("en-US")} pageviews · No video
                  </p>
                  <Link
                    href={`/admin/recipes/${row.recipeId}`}
                    className={`mt-2 inline-block text-xs font-semibold ${adminLinkClass}`}
                  >
                    Attach video
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : recipeFilter === "no-video" && funnel.noVideoTraffic.length === 0 ? (
          <p className="text-sm text-muted">
            No published recipes without a video received visitors in this period.
          </p>
        ) : null}
      </section>

      {funnel.placements.length > 0 ? (
        <section aria-labelledby="funnel-placements-heading" className="space-y-3">
          <div>
            <h2 id="funnel-placements-heading" className="font-serif text-lg text-ink">
              CTA placement
            </h2>
            <p className="mt-1 text-sm text-muted">
              Where Watch on YouTube and Subscribe CTA clicks occur on the page.
            </p>
          </div>
          <div className="overflow-x-auto border-y border-line/70">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className={adminTableHeadClass}>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Placement
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Watch on YouTube
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Subscribe CTA
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.placements.map((row) => (
                  <tr key={row.placement} className="border-t border-line/70">
                    <td className="px-3 py-3">{row.label}</td>
                    <td className="px-3 py-3">{row.watchOnYoutubeClicks}</td>
                    <td className="px-3 py-3">{row.subscribeCtaClicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <details className="border-t border-line/70 pt-3">
        <summary
          className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing} rounded-sm`}
        >
          Methodology
        </summary>
        <dl className="mt-4 space-y-4 text-xs leading-5 text-muted">
          <div>
            <dt className="font-semibold text-ink">Unique visitor denominator</dt>
            <dd className="mt-1">
              Distinct mks_guest visitors on published recipe pages that have a linked YouTube video.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Raw events vs visitors</dt>
            <dd className="mt-1">
              Play, click, and chapter counts are total events. Visitor rates count each visitor once
              per outcome type.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Independent outcomes</dt>
            <dd className="mt-1">
              Play, Watch on YouTube, Subscribe CTA, and continued viewing are parallel behaviors from
              the same recipe-visitor base — not sequential funnel stages.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Pageviews</dt>
            <dd className="mt-1">
              Linked-recipe pageview totals are shown for context but are never used as rate
              denominators.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Continued-viewing formula (site-wide)</dt>
            <dd className="mt-1">
              Unique visitors who interacted with ≥2 distinct Mesa youtubeVideoIds ÷ unique visitors
              with ≥1 qualifying interaction (embedded play, Watch on YouTube, or Watch Next).
              Qualifying interactions use source and target video IDs from watch-next events.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">{RECIPE_MULTI_VIDEO_VISITORS_LABEL} (recipe table)</dt>
            <dd className="mt-1">{RECIPE_MULTI_VIDEO_VISITORS_HELP}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">UTC / include today</dt>
            <dd className="mt-1">
              The selected window ends on today UTC inclusive. First-party events are near-real-time,
              unlike YouTube Analytics lag.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Linked-recipe scope</dt>
            <dd className="mt-1">
              Pageview visitors are counted only on published recipes with a YouTube video link.
              Funnel events are site-wide in the window but attributed to recipe slugs when recorded.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">mks_guest</dt>
            <dd className="mt-1">
              First-party anonymous visitor cookie used for deduplication. Human visitors only (Phase
              2D); Likely automated, Bot, and Unknown excluded.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Low sample</dt>
            <dd className="mt-1">
              When fewer than 20 unique visitors, rates show whole percentages without decimals and a
              limited-sample notice appears.
            </dd>
          </div>
        </dl>
      </details>

      {funnel.diagnostics ? (
        <details className="border-t border-line/70 pt-3 text-xs text-muted">
          <summary
            className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing} rounded-sm`}
          >
            Technical diagnostics
          </summary>
          <div className="mt-3 space-y-2 break-words">
            <p>Window: {funnel.diagnostics.windowLabel}</p>
            <p>
              Endpoints: {funnel.diagnostics.trackingEndpoints.guestPageview};{" "}
              {funnel.diagnostics.trackingEndpoints.funnelEvents}
            </p>
            <p>
              Latest linked recipe pageview:{" "}
              {funnel.diagnostics.latestPageview
                ? `${funnel.diagnostics.latestPageview.path} · ${funnel.diagnostics.latestPageview.receivedAt} · visitor ${funnel.diagnostics.latestPageview.visitorMasked}`
                : "none yet"}
            </p>
            <p>
              Latest funnel event:{" "}
              {funnel.diagnostics.latestFunnelEvent
                ? `${funnel.diagnostics.latestFunnelEvent.name} · ${funnel.diagnostics.latestFunnelEvent.recipeSlug} · ${funnel.diagnostics.latestFunnelEvent.receivedAt} · visitor ${funnel.diagnostics.latestFunnelEvent.visitorMasked}`
                : "none yet"}
            </p>
          </div>
        </details>
      ) : funnel.editorTracking ? (
        <details className="border-t border-line/70 pt-3 text-xs text-muted">
          <summary
            className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing} rounded-sm`}
          >
            Tracking status
          </summary>
          <div className="mt-3 space-y-2">
            <p>{funnel.editorTracking.trackingActive ? "Tracking active" : "No recent activity"}</p>
            <p>
              Last recorded event:{" "}
              {funnel.editorTracking.lastEvent
                ? `${funnel.editorTracking.lastEvent.name} · ${funnel.editorTracking.lastEvent.receivedAt}`
                : "none yet"}
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
