import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  adminFocusRing,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import { canAccess } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import {
  loadContentPerformanceDashboard,
  parseContentPerformanceRangeDays,
} from "@/lib/content-performance/dashboard";
import {
  formatMetricCtr,
  formatMetricNumber,
  formatMetricPosition,
  formatYoutubeViews,
} from "@/lib/content-performance/display";
import type {
  ContentPerformanceSort,
  ContentPerformanceStatusFilter,
  ContentPerformanceVideoFilter,
} from "@/lib/content-performance/types";
import { ANALYTICS_RANGE_DAYS } from "@/lib/content-performance/ranges";

export const metadata: Metadata = {
  title: "Content Performance",
};

export const dynamic = "force-dynamic";

function parseSort(raw: unknown): ContentPerformanceSort {
  const value = String(raw || "").trim();
  if (
    value === "google_clicks" ||
    value === "google_impressions" ||
    value === "google_ctr" ||
    value === "google_position" ||
    value === "youtube_views" ||
    value === "title" ||
    value === "website_views"
  ) {
    return value;
  }
  return "website_views";
}

function parseStatus(raw: unknown): ContentPerformanceStatusFilter {
  const value = String(raw || "").trim();
  if (value === "draft" || value === "all" || value === "published") return value;
  return "published";
}

function parseVideo(raw: unknown): ContentPerformanceVideoFilter {
  const value = String(raw || "").trim();
  if (value === "linked" || value === "none" || value === "all") return value;
  return "all";
}

function kpiCard(label: string, value: string, source: string) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">{source}</p>
      <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}

export default async function AdminContentPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    sort?: string;
    status?: string;
    video?: string;
  }>;
}) {
  const admin = await requireAccess("content");
  const includeYoutube = canAccess(admin.role, "youtube");
  const params = await searchParams;
  const rangeDays = parseContentPerformanceRangeDays(params.range);
  const sort = parseSort(params.sort);
  const status = parseStatus(params.status);
  const video = parseVideo(params.video);

  const dashboard = await loadContentPerformanceDashboard({
    rangeDays,
    sort,
    status,
    video,
    includeYoutube,
  });

  const qs = (overrides: Record<string, string>) => {
    const next = new URLSearchParams({
      range: String(rangeDays),
      sort,
      status,
      video,
      ...overrides,
    });
    return `/admin/content-performance?${next.toString()}`;
  };

  return (
    <div className="min-w-0 space-y-8">
      <AdminPageHeader
        title="Content Performance"
        description="Cross-source performance for Recipes and public pages. Metrics stay labeled by source — website, Google Search, Mesa funnel, and YouTube are never blended into one score."
        documentationTopicId="content-performance"
        titleClassName="font-serif text-3xl text-ink"
        className="mb-0"
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {ANALYTICS_RANGE_DAYS.map((days) => (
          <Link
            key={days}
            href={qs({ range: String(days) })}
            className={`${days === rangeDays ? adminPrimaryButtonClass : adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Last {days} days
          </Link>
        ))}
      </div>

      <section className="grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3" aria-label="Source coverage">
        <p>
          <span className="font-semibold text-ink">Website</span>
          <br />
          Human page views through today ({dashboard.range.labelStartDate} window start)
        </p>
        <p>
          <span className="font-semibold text-ink">Google Search</span>
          <br />
          {dashboard.coverage.googleConnected
            ? `Data through ${dashboard.coverage.googleLastDataDate || "synced days"}`
            : "Not connected"}{" "}
          ·{" "}
          <Link href="/admin/search-console" className={`${adminLinkClass} ${adminFocusRing}`}>
            Search Console
          </Link>
        </p>
        {includeYoutube ? (
          <p>
            <span className="font-semibold text-ink">YouTube</span>
            <br />
            {dashboard.coverage.youtubeConnected
              ? `Last sync ${dashboard.coverage.youtubeLastSuccessfulSyncAt || "unknown"}`
              : "Not connected"}{" "}
            ·{" "}
            <Link href="/admin/youtube" className={`${adminLinkClass} ${adminFocusRing}`}>
              YouTube Analytics
            </Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="cp-overview">
        <h2 id="cp-overview" className="font-serif text-2xl text-ink">
          Overview
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCard(
            "Page views",
            dashboard.overview.websitePageViews.toLocaleString("en-US"),
            "Website",
          )}
          {kpiCard(
            "Unique visitors",
            dashboard.overview.websiteUniqueVisitors.toLocaleString("en-US"),
            "Website",
          )}
          {kpiCard(
            "Clicks",
            formatMetricNumber(
              dashboard.overview.googleClicks,
              dashboard.overview.googleAvailability as "available",
            ),
            "Google Search",
          )}
          {kpiCard(
            "Impressions",
            formatMetricNumber(
              dashboard.overview.googleImpressions,
              dashboard.overview.googleAvailability as "available",
            ),
            "Google Search",
          )}
          {includeYoutube
            ? kpiCard(
                "Views",
                formatYoutubeViews(
                  dashboard.overview.youtubeViews,
                  dashboard.overview.youtubeAvailability as "available",
                ),
                "YouTube",
              )
            : null}
          {kpiCard(
            "Video opens from recipe",
            dashboard.overview.recipeToVideoOpens.toLocaleString("en-US"),
            "Mesa Funnel",
          )}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="cp-recipes">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="cp-recipes" className="font-serif text-2xl text-ink">
              Recipes
            </h2>
            <p className="mt-1 text-sm text-muted">
              Sorted by a real source metric. Historical Google URLs map to Recipe.id via Redirects.
            </p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input type="hidden" name="range" value={rangeDays} />
            <label className="text-sm text-muted">
              Sort
              <select
                name="sort"
                defaultValue={sort}
                className="ml-2 border border-line bg-paper px-2 py-1 text-ink"
              >
                <option value="website_views">Website views</option>
                <option value="google_clicks">Google clicks</option>
                <option value="google_impressions">Google impressions</option>
                <option value="google_ctr">Google CTR</option>
                <option value="google_position">Google position (lower better)</option>
                {includeYoutube ? <option value="youtube_views">YouTube views</option> : null}
                <option value="title">Title</option>
              </select>
            </label>
            <label className="text-sm text-muted">
              Status
              <select
                name="status"
                defaultValue={status}
                className="ml-2 border border-line bg-paper px-2 py-1 text-ink"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="text-sm text-muted">
              Video
              <select
                name="video"
                defaultValue={video}
                className="ml-2 border border-line bg-paper px-2 py-1 text-ink"
              >
                <option value="all">All</option>
                <option value="linked">Linked video</option>
                <option value="none">No video</option>
              </select>
            </label>
            <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
              Apply
            </button>
          </form>
        </div>

        {dashboard.recipes.length === 0 ? (
          <p className="text-sm text-muted">No recipes match these filters.</p>
        ) : (
          <ul className="space-y-3">
            {dashboard.recipes.map((recipe) => (
              <li key={recipe.recipeId} className="border border-line bg-paper px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/content-performance/recipes/${recipe.recipeId}?range=${rangeDays}`}
                      className={`font-serif text-xl text-ink ${adminFocusRing}`}
                    >
                      {recipe.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted">
                      {recipe.status} · {recipe.publicPath}
                      {recipe.hasLinkedVideo ? " · Linked video" : ""}
                    </p>
                  </div>
                  <Link
                    href={`/admin/recipes/${recipe.recipeId}`}
                    className={`${adminLinkClass} ${adminFocusRing} text-sm`}
                  >
                    Edit recipe
                  </Link>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
                  <p>
                    <span className="font-semibold text-ink">Website</span>
                    <br />
                    {formatMetricNumber(recipe.website.pageViews, recipe.website.availability)} views
                    {recipe.website.uniqueVisitors != null
                      ? ` · ${recipe.website.uniqueVisitors.toLocaleString("en-US")} visitors`
                      : ""}
                  </p>
                  <p>
                    <span className="font-semibold text-ink">Google</span>
                    <br />
                    {formatMetricNumber(recipe.google.clicks, recipe.google.availability)} clicks ·{" "}
                    {formatMetricNumber(recipe.google.impressions, recipe.google.availability)} impr
                    · {formatMetricCtr(recipe.google.ctr, recipe.google.availability)} · pos{" "}
                    {formatMetricPosition(recipe.google.position, recipe.google.availability)}
                  </p>
                  <p>
                    <span className="font-semibold text-ink">Mesa Funnel</span>
                    <br />
                    {recipe.funnel.recipeToVideoOpens ?? 0} recipe→video ·{" "}
                    {recipe.funnel.videoToRecipeClicks ?? 0} video→recipe
                  </p>
                  {includeYoutube ? (
                    <p>
                      <span className="font-semibold text-ink">YouTube</span>
                      <br />
                      {recipe.youtube
                        ? formatYoutubeViews(recipe.youtube.views, recipe.youtube.availability)
                        : "No linked video"}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="cp-other">
        <h2 id="cp-other" className="font-serif text-2xl text-ink">
          Other public pages
        </h2>
        <p className="text-sm text-muted">Collections, categories, hubs, and static routes.</p>
        {dashboard.series.length > 0 ? (
          <ul className="space-y-2">
            {dashboard.series.map((row) => (
              <li key={row.seriesId} className="border border-line px-4 py-3 text-sm">
                <p className="font-semibold text-ink">{row.title}</p>
                <p className="text-muted">
                  Collection · {row.publicPath} · Website{" "}
                  {formatMetricNumber(row.website.pageViews, row.website.availability)} · Google{" "}
                  {formatMetricNumber(row.google.clicks, row.google.availability)} clicks
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        {dashboard.otherPages.length === 0 && dashboard.series.length === 0 ? (
          <p className="text-sm text-muted">No other page metrics in this period.</p>
        ) : (
          <ul className="space-y-2">
            {dashboard.otherPages.map((page) => (
              <li key={page.path} className="border border-line px-4 py-3 text-sm">
                <p className="font-semibold text-ink">{page.label}</p>
                <p className="text-muted">
                  {page.routeKind.replace(/_/g, " ")} · {page.path} · Website{" "}
                  {formatMetricNumber(page.website.pageViews, page.website.availability)} · Google{" "}
                  {formatMetricNumber(page.google.clicks, page.google.availability)} clicks
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dashboard.unresolvedPages.length > 0 || dashboard.unresolvedGooglePathCount > 0 ? (
        <section className="space-y-3" aria-labelledby="cp-unresolved">
          <h2 id="cp-unresolved" className="font-serif text-2xl text-ink">
            Unresolved historical pages
          </h2>
          <p className="text-sm text-muted">
            {dashboard.unresolvedGooglePathCount} Google path
            {dashboard.unresolvedGooglePathCount === 1 ? "" : "s"} could not be matched to current
            Mesa content. This is informational — not a Site Health defect.
          </p>
          <ul className="space-y-2">
            {dashboard.unresolvedPages.slice(0, 40).map((page) => (
              <li key={page.path} className="border border-line px-4 py-3 text-sm text-muted">
                <span className="text-ink">{page.path}</span>
                {" · "}
                Website {formatMetricNumber(page.website.pageViews, page.website.availability)}
                {" · "}
                Google {formatMetricNumber(page.google.clicks, page.google.availability)} clicks
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
