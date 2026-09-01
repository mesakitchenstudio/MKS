"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import {
  formatContinuedViewingOutcome,
  formatRecipeVisitorOutcome,
  FUNNEL_METHODOLOGY,
  isFunnelLowSample,
} from "@/lib/youtube-funnel/funnel-display";
import type { YoutubeFunnelDashboard } from "@/lib/youtube-funnel/types";
import { ANALYTICS_RANGE_DAYS, type AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

type RecipeFilter = "all" | "has-video" | "no-video";

function OutcomeCard({
  title,
  numerator,
  denominator,
  rawEventLabel,
  rawEventCount,
  ariaLabel,
}: {
  title: string;
  numerator: number;
  denominator: number;
  rawEventLabel: string;
  rawEventCount: number;
  ariaLabel: string;
}) {
  const outcome = formatRecipeVisitorOutcome(numerator, denominator);
  const primary =
    outcome.rateLabel && !outcome.limitedSample
      ? `${outcome.fractionLabel} · ${outcome.rateLabel}`
      : outcome.rateLabel
        ? `${outcome.fractionLabel} · ${outcome.rateLabel}`
        : outcome.fractionLabel;

  return (
    <article
      className="rounded-sm border border-line bg-paper px-4 py-4"
      aria-label={ariaLabel}
    >
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        {title}
      </h3>
      <p className="mt-2 font-serif text-xl text-ink">{primary}</p>
      <p className="mt-1 text-sm text-muted">
        {rawEventCount.toLocaleString("en-US")} {rawEventLabel}
      </p>
    </article>
  );
}

function ContinuedOutcomeCard({
  continued,
  interacted,
}: {
  continued: number;
  interacted: number;
}) {
  const outcome = formatContinuedViewingOutcome(continued, interacted);
  const primary =
    outcome.rateLabel && interacted > 0
      ? `${outcome.fractionLabel} · ${outcome.rateLabel}`
      : outcome.headline;

  return (
    <article
      className="rounded-sm border border-line bg-paper px-4 py-4"
      aria-label={`Continued viewing: ${outcome.headline}`}
    >
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Continued viewing
      </h3>
      <p className="mt-2 font-serif text-xl text-ink">{primary}</p>
      <p className="mt-1 text-sm text-muted">{outcome.headline}</p>
    </article>
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
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>("all");

  const summary = funnel.summary;
  const visitorBase = summary.uniquePageviewVisitors;
  const lowSample = isFunnelLowSample(visitorBase);

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">Website funnel</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{FUNNEL_METHODOLOGY.intro}</p>
          <p className="mt-2 text-xs text-muted">
            {funnel.startDate} → {funnel.endDate} UTC (includes today)
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-xs"
          role="group"
          aria-label="Date range"
        >
          {ANALYTICS_RANGE_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                funnel.rangeDays === days ? "bg-sand text-ink" : "text-muted hover:text-ink"
              } ${adminFocusRing}`}
              onClick={() => updateRange(days)}
            >
              {days} days
            </button>
          ))}
        </div>
      </header>

      {lowSample ? (
        <div
          className="rounded-sm border border-line bg-cream/40 px-4 py-3 text-sm text-ink"
          role="status"
        >
          <p className="font-semibold">Limited sample</p>
          <p className="mt-1 text-muted">{FUNNEL_METHODOLOGY.lowSampleNotice(visitorBase)}</p>
        </div>
      ) : null}

      <section aria-labelledby="funnel-visitor-base-heading">
        <h3
          id="funnel-visitor-base-heading"
          className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive"
        >
          Video-linked recipe visitors
        </h3>
        <div className="mt-3 rounded-sm border border-line bg-paper px-4 py-4">
          <p className="font-serif text-2xl text-ink">
            {visitorBase.toLocaleString("en-US")} unique visitor{visitorBase === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {summary.linkedRecipePageviews.toLocaleString("en-US")} linked-recipe pageviews
          </p>
          <p className="mt-2 text-xs text-muted">
            Of those recipe visitors, these parallel outcomes are independent — a visitor may do
            none, one, or several.
          </p>
        </div>
      </section>

      <section aria-labelledby="funnel-outcomes-heading">
        <h3
          id="funnel-outcomes-heading"
          className="sr-only"
        >
          Parallel behavior outcomes
        </h3>
        <ul className="grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          <li>
            <OutcomeCard
              title="Played embedded video"
              numerator={summary.uniquePlayVisitors}
              denominator={visitorBase}
              rawEventLabel="plays"
              rawEventCount={summary.videoPlays}
              ariaLabel={`Played embedded video: ${summary.uniquePlayVisitors} of ${visitorBase} visitors`}
            />
          </li>
          <li>
            <OutcomeCard
              title="Watch on YouTube"
              numerator={summary.uniqueWatchOnYoutubeVisitors}
              denominator={visitorBase}
              rawEventLabel="clicks"
              rawEventCount={summary.watchOnYoutubeClicks}
              ariaLabel={`Watch on YouTube: ${summary.uniqueWatchOnYoutubeVisitors} of ${visitorBase} visitors`}
            />
          </li>
          <li>
            <OutcomeCard
              title="Subscribe CTA"
              numerator={summary.uniqueSubscribeVisitors}
              denominator={visitorBase}
              rawEventLabel="Subscribe CTA clicks"
              rawEventCount={summary.subscribeCtaClicks}
              ariaLabel={`Subscribe CTA: ${summary.uniqueSubscribeVisitors} of ${visitorBase} visitors`}
            />
          </li>
          <li>
            <ContinuedOutcomeCard
              continued={summary.continuedViewingSessions}
              interacted={summary.videoInteractionSessions}
            />
          </li>
        </ul>
      </section>

      {summary.chapterClicks > 0 ? (
        <p className="text-sm text-muted">
          Also recorded: {summary.chapterClicks.toLocaleString("en-US")} chapter clicks
          {summary.uniqueChapterVisitors > 0
            ? ` from ${summary.uniqueChapterVisitors.toLocaleString("en-US")} visitor${summary.uniqueChapterVisitors === 1 ? "" : "s"}`
            : ""}
          .
        </p>
      ) : null}

      {funnel.placements.length > 0 ? (
        <section aria-labelledby="funnel-placements-heading">
          <h3 id="funnel-placements-heading" className="font-serif text-lg text-ink">
            CTA placement
          </h3>
          <p className="mt-1 text-sm text-muted">
            Where Watch on YouTube and Subscribe CTA clicks occur on the page.
          </p>
          <div className="mt-3 overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className={adminTableHeadClass}>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Placement
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Watch on YouTube
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Subscribe CTA
                  </th>
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

      <section aria-labelledby="funnel-recipes-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="funnel-recipes-heading" className="font-serif text-lg text-ink">
              Recipe performance
            </h3>
            <p className="mt-1 text-sm text-muted">
              Visitor counts use each recipe&apos;s unique visitors as the denominator. Sorted by
              visitors descending.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1 text-xs"
            role="group"
            aria-label="Recipe filter"
          >
            {(
              [
                ["all", "All"],
                ["has-video", "Has video"],
                ["no-video", "No video"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                  recipeFilter === value ? "bg-sand text-ink" : "text-muted hover:text-ink"
                } ${adminFocusRing}`}
                onClick={() => setRecipeFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {recipeFilter !== "no-video" ? (
          <>
            <div className="mt-3 hidden overflow-x-auto rounded-sm border border-line md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className={adminTableHeadClass}>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Recipe
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Visitors
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Played
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Watch YT
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Subscribe
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Continued
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecipes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-muted">
                        No linked recipes with traffic in this period.
                      </td>
                    </tr>
                  ) : (
                    filteredRecipes.map((row) => (
                      <tr key={row.recipeId} className="border-t border-line/70">
                        <td className="px-4 py-3">
                          <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                            {row.recipeTitle}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {row.uniquePageviewVisitors.toLocaleString("en-US")}
                        </td>
                        <td className="px-4 py-3">{row.playOutcomeLabel}</td>
                        <td className="px-4 py-3">{row.watchOutcomeLabel}</td>
                        <td className="px-4 py-3">{row.subscribeOutcomeLabel}</td>
                        <td className="px-4 py-3">{row.continuedOutcomeLabel}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/youtube/videos/${row.youtubeVideoId}?range=${funnel.rangeDays}`}
                            className={`text-xs font-semibold ${adminLinkClass}`}
                          >
                            View video
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <ul className="mt-3 space-y-3 md:hidden">
              {filteredRecipes.length === 0 ? (
                <li className="rounded-sm border border-line px-4 py-6 text-sm text-muted">
                  No linked recipes with traffic in this period.
                </li>
              ) : (
                filteredRecipes.map((row) => (
                  <li
                    key={row.recipeId}
                    className="rounded-sm border border-line bg-paper px-4 py-3 text-sm"
                  >
                    <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                      <span className="font-semibold text-ink">{row.recipeTitle}</span>
                    </Link>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted">Visitors</dt>
                      <dd>{row.uniquePageviewVisitors.toLocaleString("en-US")}</dd>
                      <dt className="text-muted">Played</dt>
                      <dd>{row.playOutcomeLabel}</dd>
                      <dt className="text-muted">Watch YT</dt>
                      <dd>{row.watchOutcomeLabel}</dd>
                      <dt className="text-muted">Subscribe</dt>
                      <dd>{row.subscribeOutcomeLabel}</dd>
                      <dt className="text-muted">Continued</dt>
                      <dd>{row.continuedOutcomeLabel}</dd>
                    </dl>
                    <Link
                      href={`/admin/youtube/videos/${row.youtubeVideoId}?range=${funnel.rangeDays}`}
                      className={`mt-2 inline-block text-xs font-semibold ${adminLinkClass}`}
                    >
                      View video
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : null}

        {showNoVideoSection ? (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-ink">Recipes with traffic but no video</h4>
            <p className="mt-1 text-xs text-muted">
              Published recipes receiving visitors without a linked YouTube video.
            </p>
            <div className="mt-3 hidden overflow-x-auto rounded-sm border border-line md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className={adminTableHeadClass}>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Recipe
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Visitors
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Pageviews
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Video
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.noVideoTraffic.map((row) => (
                    <tr key={row.recipeId} className="border-t border-line/70">
                      <td className="px-4 py-3">
                        <Link href={`/admin/recipes/${row.recipeId}`} className={adminLinkClass}>
                          {row.recipeTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {row.uniquePageviewVisitors.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3">{row.pageviews.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-muted">No video</td>
                      <td className="px-4 py-3">
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
            <ul className="mt-3 space-y-3 md:hidden">
              {funnel.noVideoTraffic.map((row) => (
                <li
                  key={row.recipeId}
                  className="rounded-sm border border-line bg-paper px-4 py-3 text-sm"
                >
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
          <p className="mt-3 text-sm text-muted">
            No published recipes without a video received visitors in this period.
          </p>
        ) : null}
      </section>

      <details className="rounded-sm border border-line bg-cream/30 px-4 py-3">
        <summary
          className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing} rounded-sm`}
        >
          About these metrics
        </summary>
        <div className="mt-3 space-y-3 text-xs leading-5 text-muted">
          <p>
            <strong className="text-ink">Unique visitor denominator:</strong> distinct mks_guest
            visitors on published recipe pages that have a linked YouTube video.
          </p>
          <p>
            <strong className="text-ink">Raw events vs visitors:</strong> play, click, and chapter
            counts are total events. Visitor rates count each visitor once per outcome type.
          </p>
          <p>
            <strong className="text-ink">Independent outcomes:</strong> Play, Watch on YouTube,
            Subscribe CTA, and continued viewing are parallel behaviors from the same recipe-visitor
            base — not sequential funnel stages.
          </p>
          <p>
            <strong className="text-ink">Pageviews:</strong> linked-recipe pageview totals are shown
            for context but are never used as rate denominators.
          </p>
          <p>
            <strong className="text-ink">Continued-viewing formula:</strong> unique visitors who
            interacted with ≥2 distinct Mesa youtubeVideoIds ÷ unique visitors with ≥1 qualifying
            interaction (embedded play, Watch on YouTube, or Watch Next). Qualifying interactions use
            source and target video IDs from watch-next events.
          </p>
          <p>
            <strong className="text-ink">UTC / include today:</strong> the selected window ends on
            today UTC inclusive. First-party events are near-real-time, unlike YouTube Analytics lag.
          </p>
          <p>
            <strong className="text-ink">Linked-recipe scope:</strong> pageview visitors are counted
            only on published recipes with a YouTube video link. Funnel events are site-wide in the
            window but attributed to recipe slugs when recorded.
          </p>
          <p>
            <strong className="text-ink">mks_guest:</strong> first-party anonymous visitor cookie used
            for deduplication. Human user agents only; bots excluded.
          </p>
          <p>
            <strong className="text-ink">Low sample:</strong> when fewer than 20 unique visitors,
            rates show whole percentages without decimals and a limited-sample notice appears.
          </p>
        </div>
      </details>

      {funnel.diagnostics ? (
        <details className="rounded-sm border border-dashed border-line bg-cream/30 px-4 py-3 text-xs text-muted">
          <summary
            className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing} rounded-sm`}
          >
            Technical diagnostics
          </summary>
          <div className="mt-3 space-y-1">
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
        <details className="rounded-sm border border-dashed border-line bg-cream/30 px-4 py-3 text-xs text-muted">
          <summary
            className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing} rounded-sm`}
          >
            Tracking status
          </summary>
          <div className="mt-3 space-y-1">
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
