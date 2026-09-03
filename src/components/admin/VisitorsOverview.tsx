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
import {
  GUEST_TRAFFIC_SOURCES,
  guestTrafficSourceLabel,
  type GuestTrafficSource,
} from "@/lib/guest-acquisition";
import { adminFocusRing } from "@/lib/admin-ui";
import { VisitorsTable } from "@/components/admin/VisitorsTable";

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
}) {
  const totalSourceVisitors = trafficSources.reduce((sum, row) => sum + row.visitors, 0);
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="mt-8 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-xs text-muted">Staff and preview traffic is currently included.</p>
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
          <SummaryMetric value={summary.onlineNow} label="Online now" hint="Live non-bot presence" />
          <SummaryMetric
            value={summary.visitors}
            label="Visitors"
            hint={`Non-bot · last ${range} days`}
          />
          <SummaryMetric
            value={summary.pageViews}
            label="Page views"
            hint={`Non-bot · last ${range} days`}
          />
          <SummaryMetric
            value={summary.recipeViews}
            label="Recipe views"
            hint="Non-bot recipe views"
          />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="popular-content-heading">
          <h2 id="popular-content-heading" className="font-serif text-xl text-ink">
            Popular content
          </h2>
          <p className="mt-1 text-xs text-muted">
            Non-bot views · Coming Soon excluded from ranking
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
            First external referrer per visitor · Direct includes empty referrers
          </p>
          {trafficSources.length === 0 ? (
            <p className="mt-4 border border-dashed border-line bg-paper px-4 py-6 text-sm text-muted">
              No non-bot visitors in this period.
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

      <section aria-labelledby="recent-visitors-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="recent-visitors-heading" className="font-serif text-xl text-ink">
              Recent visitors
            </h2>
            <p className="mt-1 text-xs text-muted">
              {list.total === 0
                ? "No matching visitors"
                : `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${list.total.toLocaleString("en-US")}`}
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1"
          role="group"
          aria-label="Visitor classification"
        >
          {(
            [
              ["humans", "Humans"],
              ["bots", "Bots"],
              ["unknown", "Unknown"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={buildVisitorsHref({ range, kind: value, source, q })}
              className={`${chipBase} ${kind === value ? chipActive : chipIdle}`}
              aria-current={kind === value ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>

        <form
          className="flex min-w-0 flex-wrap items-center gap-2"
          method="get"
          action="/admin/visitors"
        >
          <input type="hidden" name="range" value={String(range)} />
          <input type="hidden" name="kind" value={kind} />
          <label className="sr-only" htmlFor="visitors-search">
            Search guest or page
          </label>
          <input
            id="visitors-search"
            name="q"
            defaultValue={q}
            placeholder="Search guest or page…"
            className={`min-w-[12rem] flex-1 rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
          />
          <label htmlFor="visitors-source" className="sr-only">
            Filter by traffic source
          </label>
          <select
            id="visitors-source"
            name="source"
            defaultValue={source}
            className={`rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
          >
            <option value="all">All sources</option>
            {GUEST_TRAFFIC_SOURCES.map((value) => (
              <option key={value} value={value}>
                {guestTrafficSourceLabel(value)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={`rounded-sm border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
          >
            Apply
          </button>
        </form>

        <VisitorsTable
          key={`${range}-${kind}-${source}-${q}-${list.page}`}
          visitors={list.rows}
        />

        {totalPages > 1 ? (
          <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
            <p className="text-muted">
              Page {list.page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {list.page > 1 ? (
                <Link
                  href={buildVisitorsHref({ range, kind, source, q, page: list.page - 1 })}
                  className={`rounded-sm border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-sm border border-line px-3 py-1.5 text-muted">Previous</span>
              )}
              {list.page < totalPages ? (
                <Link
                  href={buildVisitorsHref({ range, kind, source, q, page: list.page + 1 })}
                  className={`rounded-sm border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-sm border border-line px-3 py-1.5 text-muted">Next</span>
              )}
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
