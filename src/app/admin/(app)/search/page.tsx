import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAccess } from "@/lib/auth";
import { loadSearchAnalyticsDashboard } from "@/lib/search-analytics-dashboard";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { parseAnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

export const metadata: Metadata = {
  title: "Search",
};

export const dynamic = "force-dynamic";

export default async function AdminSearchAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAccess("content");
  const params = await searchParams;
  const rangeDays = parseAnalyticsRangeDays(params.range);
  const dashboard = await loadSearchAnalyticsDashboard({ analyticsRangeDays: rangeDays });

  function rangeHref(days: number) {
    return days === 28 ? "/admin/search" : `/admin/search?range=${days}`;
  }

  return (
    <div className="min-w-0 space-y-8">
      <AdminPageHeader
        title="Search"
        description="Popular recipe searches and zero-result terms from consented visitors. Not a traffic dashboard and not per-person browsing history."
        documentationTopicId="search-analytics"
        titleClassName="font-serif text-3xl text-ink"
        className="mb-0"
        actions={
          <>
            {[7, 28, 90].map((days) => (
              <Link
                key={days}
                href={rangeHref(days)}
                className={`${adminLinkClass} ${adminFocusRing} ${
                  rangeDays === days ? "font-semibold text-ink" : ""
                }`}
              >
                {days}d
              </Link>
            ))}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Searches
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{dashboard.totalSearches}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Zero-result
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{dashboard.zeroResultSearches}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Window
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{dashboard.rangeDays}d</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl text-ink">Popular searches</h2>
        {dashboard.popular.length === 0 ? (
          <p className="text-sm text-muted">No searches recorded in this window yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className={adminTableHeadClass}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Query</th>
                  <th className="px-3 py-2 font-semibold">Searches</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.popular.map((row) => (
                  <tr key={row.query} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{row.query}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{row.searches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl text-ink">Zero-result searches</h2>
        <p className="text-sm text-muted">
          Terms visitors searched that matched no published recipes — useful content opportunities.
        </p>
        {dashboard.zeroResults.length === 0 ? (
          <p className="text-sm text-muted">No zero-result text searches in this window.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className={adminTableHeadClass}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Query</th>
                  <th className="px-3 py-2 font-semibold">Searches</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.zeroResults.map((row) => (
                  <tr key={row.query} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{row.query}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{row.searches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl text-ink">Filter dead ends</h2>
        <p className="text-sm text-muted">
          Filter combinations (without a text query) that returned no recipes.
        </p>
        {dashboard.filterDeadEnds.length === 0 ? (
          <p className="text-sm text-muted">No filter-only dead ends in this window.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className={adminTableHeadClass}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Filters</th>
                  <th className="px-3 py-2 font-semibold">Hits</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.filterDeadEnds.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-xs text-ink">{row.label}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{row.searches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
