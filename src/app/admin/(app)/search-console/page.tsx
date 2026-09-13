import type { Metadata } from "next";
import Link from "next/link";
import {
  disconnectSearchConsoleAction,
  selectSearchConsolePropertyAction,
  syncSearchConsoleNowAction,
} from "@/app/admin/search-console-actions";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  adminFocusRing,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTableHeadClass,
} from "@/lib/admin-ui";
import { canManageSearchConsole } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import {
  formatSearchConsoleCtr,
  formatSearchConsolePosition,
} from "@/lib/search-console/aggregate";
import { listVerifiedSearchConsoleProperties } from "@/lib/search-console/connection";
import {
  loadSearchConsoleDashboard,
  parseSearchConsoleRangeDays,
} from "@/lib/search-console/dashboard";
import { ANALYTICS_RANGE_DAYS } from "@/lib/youtube-analytics/ranges";
import { formatAdminDateTime } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Search Console",
};

export const dynamic = "force-dynamic";

function kpiCard(label: string, value: string) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}

export default async function AdminSearchConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; error?: string; connected?: string }>;
}) {
  const admin = await requireAccess("content");
  const canManage = canManageSearchConsole(admin.role);
  const params = await searchParams;
  const rangeDays = parseSearchConsoleRangeDays(params.range);
  const dashboard = await loadSearchConsoleDashboard({ rangeDays });
  const { connection, kpis, trend, topPages, topQueries, coverageNote, range } = dashboard;

  let properties: Array<{ siteUrl: string; permissionLevel: string }> = [];
  let propertyError = "";
  if (connection.connected && !connection.hasProperty && canManage) {
    try {
      properties = await listVerifiedSearchConsoleProperties();
    } catch (error) {
      propertyError = error instanceof Error ? error.message : "Could not load properties.";
    }
  }

  return (
    <div className="min-w-0 space-y-8">
      <AdminPageHeader
        title="Search Console"
        description="Understand how Mesa performs in Google Search using clicks, impressions, CTR and average position. This is not Mesa on-site Search analytics, Site Health, or Content Health."
        documentationTopicId="search-console"
        titleClassName="font-serif text-3xl text-ink"
        className="mb-0"
        actions={
          canManage && connection.connected && connection.hasProperty ? (
            <form action={syncSearchConsoleNowAction}>
              <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
                Sync now
              </button>
            </form>
          ) : null
        }
      />

      {params.error ? (
        <p className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-terracotta" role="alert">
          {params.error}
        </p>
      ) : null}
      {params.connected ? (
        <p className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-ink">
          Search Console connected{params.connected !== "1" ? ` as ${params.connected}` : ""}.
          Select a verified property to sync.
        </p>
      ) : null}

      {!connection.connected ? (
        <section className="space-y-4 rounded-sm border border-line bg-paper px-4 py-6">
          <h2 className="font-serif text-2xl text-ink">
            {connection.lastSuccessfulSyncAt || dashboard.hasLocalData
              ? "Disconnected"
              : "Connect Search Console"}
          </h2>
          {connection.lastSuccessfulSyncAt || dashboard.hasLocalData ? (
            <p className="max-w-2xl text-sm text-muted">
              Credentials are disconnected. Historical Search Console metrics below are retained and
              are not current
              {connection.lastSuccessfulSyncAt
                ? ` — last synchronized ${formatAdminDateTime(connection.lastSuccessfulSyncAt)}`
                : ""}
              {connection.lastDataDate ? ` · data through ${connection.lastDataDate}` : ""}.
            </p>
          ) : (
            <p className="max-w-2xl text-sm text-muted">
              Read-only Google Search performance for Mesa. Owners connect Google, choose one verified
              Search Console property, then sync. Mesa never changes your content or Search Console
              settings.
            </p>
          )}
          {canManage ? (
            <a
              href="/api/admin/search-console/oauth/start"
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            >
              {connection.lastSuccessfulSyncAt || dashboard.hasLocalData
                ? "Reconnect Search Console"
                : "Connect Search Console"}
            </a>
          ) : (
            <p className="text-sm text-muted">Only owners can connect Search Console.</p>
          )}
        </section>
      ) : null}

      {connection.connected && !connection.hasProperty ? (
        <section className="space-y-4 rounded-sm border border-line bg-paper px-4 py-6">
          <h2 className="font-serif text-2xl text-ink">Select a Search Console property</h2>
          <p className="text-sm text-muted">
            Connected as {connection.googleAccountEmail || "Google account"}. Choose the verified
            Mesa property — Mesa does not guess from site.url alone.
          </p>
          {propertyError ? <p className="text-sm text-terracotta">{propertyError}</p> : null}
          {canManage && properties.length > 0 ? (
            <ul className="space-y-2">
              {properties.map((property) => (
                <li key={property.siteUrl} className="flex flex-wrap items-center gap-3 border border-line px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{property.siteUrl}</p>
                    <p className="text-xs text-muted">{property.permissionLevel || "Verified"}</p>
                  </div>
                  <form action={selectSearchConsolePropertyAction}>
                    <input type="hidden" name="siteUrl" value={property.siteUrl} />
                    <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
                      Use property
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          {canManage && properties.length === 0 && !propertyError ? (
            <p className="text-sm text-muted">No verified Search Console properties were returned.</p>
          ) : null}
        </section>
      ) : null}

      {connection.hasProperty && (connection.connected || dashboard.hasLocalData) ? (
        <>
          <section className="grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
            <p>
              <span className="font-semibold text-ink">Property</span>
              <br />
              {connection.selectedProperty}
            </p>
            <p>
              <span className="font-semibold text-ink">Status</span>
              <br />
              {connection.connected ? connection.status : "disconnected"}
              {connection.lastErrorMessage ? ` — ${connection.lastErrorMessage}` : ""}
            </p>
            <p>
              <span className="font-semibold text-ink">Last synced</span>
              <br />
              {connection.lastSuccessfulSyncAt
                ? formatAdminDateTime(connection.lastSuccessfulSyncAt)
                : "Never"}
            </p>
            <p>
              <span className="font-semibold text-ink">Data through</span>
              <br />
              {connection.lastDataDate || "No data yet"}
            </p>
          </section>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
            {ANALYTICS_RANGE_DAYS.map((days) => (
              <Link
                key={days}
                href={`/admin/search-console?range=${days}`}
                className={`${days === rangeDays ? adminPrimaryButtonClass : adminSecondaryButtonClass} ${adminFocusRing}`}
              >
                Last {days} days
              </Link>
            ))}
          </div>

          {coverageNote ? <p className="text-sm text-muted">{coverageNote}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCard("Clicks", String(Math.round(kpis.clicks)))}
            {kpiCard("Impressions", String(Math.round(kpis.impressions)))}
            {kpiCard("CTR", formatSearchConsoleCtr(kpis.ctr))}
            {kpiCard("Average position", formatSearchConsolePosition(kpis.position))}
          </div>

          <section className="space-y-3" aria-labelledby="gsc-trend">
            <h2 id="gsc-trend" className="font-serif text-2xl text-ink">
              Trend ({range.startDate} → {range.endDate})
            </h2>
            {trend.length === 0 ? (
              <p className="text-sm text-muted">No synchronized page metrics in this range yet.</p>
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
                    {trend.map((day) => (
                      <tr key={day.date} className="border-b border-line">
                        <td className="px-3 py-2">{day.date}</td>
                        <td className="px-3 py-2">{Math.round(day.clicks)}</td>
                        <td className="px-3 py-2">{Math.round(day.impressions)}</td>
                        <td className="px-3 py-2">{formatSearchConsoleCtr(day.ctr)}</td>
                        <td className="px-3 py-2">{formatSearchConsolePosition(day.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="gsc-pages">
            <h2 id="gsc-pages" className="font-serif text-2xl text-ink">
              Top pages
            </h2>
            {topPages.length === 0 ? (
              <p className="text-sm text-muted">No page rows in this range.</p>
            ) : (
              <ul className="space-y-3">
                {topPages.map((page) => (
                  <li key={page.pageUrl} className="border border-line bg-paper px-4 py-3">
                    <p className="break-all text-sm text-ink">
                      {page.normalizedPath || page.pageUrl}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {page.routeKind.replace(/_/g, " ")}
                      {page.normalizedPath ? ` · ${page.pageUrl}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {Math.round(page.clicks)} clicks · {Math.round(page.impressions)} impressions ·{" "}
                      {formatSearchConsoleCtr(page.ctr)} · pos {formatSearchConsolePosition(page.position)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="gsc-queries">
            <h2 id="gsc-queries" className="font-serif text-2xl text-ink">
              Top Google searches
            </h2>
            <p className="text-sm text-muted">
              Queries people used on Google before seeing Mesa — not Mesa on-site SearchEvent data.
            </p>
            {topQueries.length === 0 ? (
              <p className="text-sm text-muted">No query rows in this range.</p>
            ) : (
              <ul className="space-y-3">
                {topQueries.map((query) => (
                  <li key={query.query} className="border border-line bg-paper px-4 py-3">
                    <p className="text-sm text-ink">{query.query}</p>
                    <p className="mt-2 text-sm text-muted">
                      {Math.round(query.clicks)} clicks · {Math.round(query.impressions)} impressions ·{" "}
                      {formatSearchConsoleCtr(query.ctr)} · pos{" "}
                      {formatSearchConsolePosition(query.position)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {canManage && connection.connected ? (
        <section className="border-t border-line pt-6">
          <h2 className="font-serif text-xl text-ink">Connection</h2>
          <p className="mt-1 text-sm text-muted">
            Disconnect removes credentials and stops sync. Historical metrics are retained.
          </p>
          <form action={disconnectSearchConsoleAction} className="mt-3">
            <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
              Disconnect Search Console
            </button>
          </form>
          <p className="mt-3 text-sm">
            <Link href="/admin/search" className={`${adminLinkClass} ${adminFocusRing}`}>
              Mesa on-site Search analytics
            </Link>
            {" · "}
            <Link href="/admin/site-health" className={`${adminLinkClass} ${adminFocusRing}`}>
              Site Health
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
