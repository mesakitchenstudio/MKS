import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  adminFocusRing,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTableHeadClass,
} from "@/lib/admin-ui";
import { canAccess } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import {
  loadRecipePerformanceDetail,
  parseContentPerformanceRangeDays,
} from "@/lib/content-performance/dashboard";
import {
  formatMetricCtr,
  formatMetricNumber,
  formatMetricPosition,
  formatYoutubeAvd,
  formatYoutubeViews,
  formatYoutubeWatchTime,
} from "@/lib/content-performance/display";
import { ANALYTICS_RANGE_DAYS } from "@/lib/content-performance/ranges";

export const metadata: Metadata = {
  title: "Recipe Performance",
};

export const dynamic = "force-dynamic";

function group(title: string, children: ReactNode) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default async function AdminRecipePerformanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const admin = await requireAccess("content");
  const includeYoutube = canAccess(admin.role, "youtube");
  const { id } = await params;
  const query = await searchParams;
  const rangeDays = parseContentPerformanceRangeDays(query.range);
  const detail = await loadRecipePerformanceDetail({
    recipeId: id,
    rangeDays,
    includeYoutube,
  });
  if (!detail) notFound();

  const { recipe, coverage, range, historicalPaths, googleTrend, websiteTrend } = detail;

  return (
    <div className="min-w-0 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href={`/admin/content-performance?range=${rangeDays}`} className={`${adminLinkClass} ${adminFocusRing}`}>
              Content Performance
            </Link>
          </p>
          <h1 className="mt-2 font-serif text-3xl text-ink">{recipe.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {recipe.status} · {recipe.publicPath}
          </p>
        </div>
        <Link
          href={`/admin/recipes/${recipe.recipeId}`}
          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
        >
          Edit recipe
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {ANALYTICS_RANGE_DAYS.map((days) => (
          <Link
            key={days}
            href={`/admin/content-performance/recipes/${recipe.recipeId}?range=${days}`}
            className={`${days === rangeDays ? adminPrimaryButtonClass : adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Last {days} days
          </Link>
        ))}
      </div>

      {group(
        "Overview",
        <div className="grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <span className="font-semibold text-ink">Website</span>
            <br />
            {formatMetricNumber(recipe.website.pageViews, recipe.website.availability)} page views
            {recipe.website.uniqueVisitors != null
              ? ` · ${recipe.website.uniqueVisitors.toLocaleString("en-US")} visitors`
              : ""}
          </p>
          <p>
            <span className="font-semibold text-ink">Google Search</span>
            <br />
            {formatMetricNumber(recipe.google.clicks, recipe.google.availability)} clicks ·{" "}
            {formatMetricNumber(recipe.google.impressions, recipe.google.availability)} impressions ·{" "}
            {formatMetricCtr(recipe.google.ctr, recipe.google.availability)} · pos{" "}
            {formatMetricPosition(recipe.google.position, recipe.google.availability)}
          </p>
          <p>
            <span className="font-semibold text-ink">Mesa Funnel</span>
            <br />
            {recipe.funnel.recipeToVideoOpens ?? 0} video opens from recipe ·{" "}
            {recipe.funnel.videoToRecipeClicks ?? 0} recipe visits from Mesa video
          </p>
          {includeYoutube ? (
            <p>
              <span className="font-semibold text-ink">YouTube</span>
              <br />
              {recipe.youtube
                ? `${formatYoutubeViews(recipe.youtube.views, recipe.youtube.availability)} views`
                : "No linked video"}
            </p>
          ) : null}
        </div>,
      )}

      {group(
        "Website",
        websiteTrend.length === 0 ? (
          <p className="text-sm text-muted">No performance data for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className={adminTableHeadClass}>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Page views</th>
                  <th className="px-3 py-2">Unique visitors</th>
                </tr>
              </thead>
              <tbody>
                {websiteTrend.map((day) => (
                  <tr key={day.date} className="border-b border-line">
                    <td className="px-3 py-2">{day.date}</td>
                    <td className="px-3 py-2">{day.pageViews}</td>
                    <td className="px-3 py-2">{day.uniqueVisitors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}

      {group(
        "Google Search",
        <>
          {googleTrend.length === 0 ? (
            <p className="text-sm text-muted">
              {recipe.google.availability === "not_connected"
                ? "Search Console is not connected."
                : "No Google page metrics for this period."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className={adminTableHeadClass}>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Clicks</th>
                    <th className="px-3 py-2">Impressions</th>
                    <th className="px-3 py-2">CTR</th>
                    <th className="px-3 py-2">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {googleTrend.map((day) => (
                    <tr key={day.date} className="border-b border-line">
                      <td className="px-3 py-2">{day.date}</td>
                      <td className="px-3 py-2">{Math.round(day.clicks)}</td>
                      <td className="px-3 py-2">{Math.round(day.impressions)}</td>
                      <td className="px-3 py-2">{formatMetricCtr(day.ctr, "available")}</td>
                      <td className="px-3 py-2">{formatMetricPosition(day.position, "available")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {historicalPaths.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-ink">Historical URLs included</h3>
              <p className="mt-1 text-sm text-muted">
                Google metrics aggregate these paths under this Recipe.id via current redirects.
                Source Search Console rows are unchanged.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {historicalPaths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted">
            Site-level Google queries stay on{" "}
            <Link href="/admin/search-console" className={`${adminLinkClass} ${adminFocusRing}`}>
              Search Console
            </Link>
            — page×query attribution is not stored.
          </p>
        </>,
      )}

      {group(
        "Mesa engagement",
        <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
          <p>
            <span className="font-semibold text-ink">Funnel (selected period)</span>
            <br />
            Video opens from recipe: {recipe.funnel.recipeToVideoOpens ?? 0}
            <br />
            Recipe visits from Mesa video: {recipe.funnel.videoToRecipeClicks ?? 0}
          </p>
          <p>
            <span className="font-semibold text-ink">Current member state</span>
            <br />
            Saved by {recipe.member.savesCurrent} members
            <br />
            {recipe.member.reviewsCurrent} reviews
            {recipe.member.averageRating != null
              ? ` · avg ${recipe.member.averageRating.toFixed(1)}`
              : ""}
          </p>
        </div>,
      )}

      {includeYoutube
        ? group(
            "YouTube",
            recipe.youtube ? (
              <div className="grid gap-3 text-sm text-muted sm:grid-cols-3">
                <p>
                  <span className="font-semibold text-ink">Video</span>
                  <br />
                  {recipe.youtube.videoId}
                </p>
                <p>
                  <span className="font-semibold text-ink">Views</span>
                  <br />
                  {formatYoutubeViews(recipe.youtube.views, recipe.youtube.availability)}
                </p>
                <p>
                  <span className="font-semibold text-ink">Watch time / AVD</span>
                  <br />
                  {formatYoutubeWatchTime(
                    recipe.youtube.estimatedMinutesWatched,
                    recipe.youtube.availability,
                  )}{" "}
                  · {formatYoutubeAvd(recipe.youtube.averageViewDuration, recipe.youtube.availability)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">No explicitly linked YouTube video.</p>
            ),
          )
        : null}

      {group(
        "Source coverage",
        <div className="grid gap-3 text-sm text-muted sm:grid-cols-3">
          <p>
            Website includes today ({range.labelStartDate} → today)
          </p>
          <p>
            Google data through {coverage.googleLastDataDate || "—"}
            {!coverage.googleConnected ? " · Not connected" : ""}
          </p>
          {includeYoutube ? (
            <p>
              YouTube last sync {coverage.youtubeLastSuccessfulSyncAt || "—"}
              {!coverage.youtubeConnected ? " · Not connected" : ""}
            </p>
          ) : null}
        </div>,
      )}
    </div>
  );
}
