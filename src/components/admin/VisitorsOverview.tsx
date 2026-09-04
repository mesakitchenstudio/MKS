import Link from "next/link";
import {
  ANALYTICS_RANGE_DAYS,
  type AnalyticsRangeDays,
} from "@/lib/youtube-analytics/ranges";
import type {
  GuestKindFilter,
  GuestTrafficSourceRow,
  GuestVisitorAdminListResult,
  VisitorAudienceSummary,
} from "@/lib/guest-analytics";
import type { GuestTrafficSource } from "@/lib/guest-acquisition";
import { adminFocusRing } from "@/lib/admin-ui";
import { VisitorsRecentSection } from "@/components/admin/VisitorsRecentSection";

function buildVisitorsHref(input: {
  range: AnalyticsRangeDays;
  kind: GuestKindFilter;
  source: GuestTrafficSource | "all";
  q: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.range !== 7) params.set("range", String(input.range));
  if (input.kind !== "humans") params.set("kind", input.kind);
  if (input.source !== "all") params.set("source", input.source);
  if (input.q) params.set("q", input.q);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const qs = params.toString();
  return qs ? `/admin/visitors?${qs}` : "/admin/visitors";
}

function SummaryMetric({
  value,
  label,
  hint,
}: {
  value: number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value.toLocaleString("en-US")}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const chipBase = `rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${adminFocusRing}`;
const chipActive = "bg-sand text-ink";
const chipIdle = "text-muted hover:text-ink";

export function VisitorsOverview({
  summary,
  popular,
  comingSoonViews,
  trafficSources,
  list,
  range,
  kind,
  source,
  q,
  canDeleteVisitors = false,
}: {
  summary: VisitorAudienceSummary;
  popular: Array<{ path: string; title: string; views: number; uniqueVisitors: number }>;
  comingSoonViews: number;
  trafficSources: GuestTrafficSourceRow[];
  list: GuestVisitorAdminListResult;
  range: AnalyticsRangeDays;
  kind: GuestKindFilter;
  source: GuestTrafficSource | "all";
  q: string;
  canDeleteVisitors?: boolean;
}) {
  const totalSourceVisitors = trafficSources.reduce((sum, row) => sum + row.visitors, 0);

  return (
    <div className="mt-8 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-xs text-muted">Staff and preview traffic is excluded.</p>
        <div
          className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1"
          role="group"
          aria-label="Date range"
        >
          {ANALYTICS_RANGE_DAYS.map((days) => (
            <Link
              key={days}
              href={buildVisitorsHref({ range: days, kind, source, q })}
              className={`${chipBase} ${range === days ? chipActive : chipIdle}`}
              aria-current={range === days ? "page" : undefined}
            >
              {days} days
            </Link>
          ))}
        </div>
      </div>

      <section aria-label="Audience summary">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric value={summary.onlineNow} label="Online now" hint="Live Human presence" />
          <SummaryMetric
            value={summary.visitors}
            label="Visitors"
            hint={`Human · last ${range} days`}
          />
          <SummaryMetric
            value={summary.pageViews}
            label="Page views"
            hint={`Human · last ${range} days`}
          />
          <SummaryMetric
            value={summary.recipeViews}
            label="Recipe views"
            hint="Human recipe views"
          />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="popular-content-heading">
          <h2 id="popular-content-heading" className="font-serif text-xl text-ink">
            Popular content
          </h2>
          <p className="mt-1 text-xs text-muted">
            Human views · Coming Soon excluded from ranking
          </p>
          {popular.length === 0 ? (
            <p className="mt-4 border border-dashed border-line bg-paper px-4 py-6 text-sm text-muted">
              No editorial page views in this period.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line border border-line bg-paper">
              {popular.map((item) => (
                <li key={item.path} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 break-all font-mono text-[0.65rem] text-muted">{item.path}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted">
                    <p className="font-semibold text-ink">{item.views.toLocaleString("en-US")}</p>
                    <p className="text-xs">
                      {item.uniqueVisitors.toLocaleString("en-US")} visitor
                      {item.uniqueVisitors === 1 ? "" : "s"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {comingSoonViews > 0 ? (
            <p className="mt-3 text-xs text-muted">
              Coming Soon: {comingSoonViews.toLocaleString("en-US")} view
              {comingSoonViews === 1 ? "" : "s"} in this period
            </p>
          ) : null}
        </section>

        <section aria-labelledby="traffic-sources-heading">
          <h2 id="traffic-sources-heading" className="font-serif text-xl text-ink">
            Traffic sources
          </h2>
          <p className="mt-1 text-xs text-muted">
            Human visitors · First-touch UTM when present, else referrer · Direct includes empty
            referrers
          </p>
          {trafficSources.length === 0 ? (
            <p className="mt-4 border border-dashed border-line bg-paper px-4 py-6 text-sm text-muted">
              No Human visitors in this period.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line border border-line bg-paper">
              {trafficSources.map((row) => {
                const pct =
                  totalSourceVisitors > 0
                    ? Math.round((row.visitors / totalSourceVisitors) * 100)
                    : 0;
                return (
                  <li
                    key={row.source}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <span className="font-semibold text-ink">{row.label}</span>
                    <span className="text-muted">
                      {row.visitors.toLocaleString("en-US")}
                      <span className="ml-2 text-xs">({pct}%)</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <VisitorsRecentSection
        key={`${range}-${kind}-${source}-${q}-${list.page}`}
        list={list}
        range={range}
        kind={kind}
        source={source}
        q={q}
        canDeleteVisitors={canDeleteVisitors}
      />
    </div>
  );
}
