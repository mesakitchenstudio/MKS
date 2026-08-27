"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { formatAdminShortDateTime } from "@/lib/datetime";
import { classifyGuestClient, guestDeviceClientLabel, isBotUserAgent } from "@/lib/guest-client";
import { guestPathTitle } from "@/lib/guest-path-labels";
import { formatPresenceLabel, isMemberOnline } from "@/lib/member-presence";
import { formatCountryCityLocation } from "@/lib/request-meta";

type GuestRow = {
  id: string;
  visitorKey: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  lastPath: string;
  userAgent: string;
  country?: string | null;
  city?: string | null;
};

type PopularPath = {
  path: string;
  title: string;
  views: number;
};

type Summary = {
  onlineNow: number;
  visitorsLast7Days: number;
  pageViewsLast7Days: number;
};

const botBadgeClass =
  "inline-flex rounded-full bg-sand px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink";

function onlineLabel(count: number) {
  return count === 1 ? "1 visitor online" : `${count} visitors online`;
}

export function VisitorsTable({
  visitors,
  popularPaths,
  summary,
  recipeTitles = {},
}: {
  visitors: GuestRow[];
  popularPaths: PopularPath[];
  summary: Summary;
  recipeTitles?: Record<string, string>;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const titles = useMemo(() => new Map(Object.entries(recipeTitles)), [recipeTitles]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(() => router.refresh(), 45_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [router]);

  const sorted = useMemo(
    () =>
      [...visitors].sort(
        (left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
      ),
    [visitors],
  );

  const liveOnlineCount = useMemo(
    () =>
      sorted.filter(
        (guest) => isMemberOnline(guest.lastSeenAt, now) && !isBotUserAgent(guest.userAgent),
      ).length,
    [sorted, now],
  );

  const [showAllPopular, setShowAllPopular] = useState(false);
  const popularPreviewLimit = 5;
  const visiblePopular = showAllPopular
    ? popularPaths
    : popularPaths.slice(0, popularPreviewLimit);
  const canTogglePopular = popularPaths.length > popularPreviewLimit;

  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric value={liveOnlineCount} label="Online now" />
        <SummaryMetric
          value={summary.visitorsLast7Days}
          label="Visitors"
          hint="Last 7 days"
        />
        <SummaryMetric
          value={summary.pageViewsLast7Days}
          label="Page views"
          hint="Last 7 days"
        />
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink">Popular pages</h2>
        <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Last 7 days
        </p>
        {popularPaths.length ? (
          <>
            <ul className="mt-3 divide-y divide-line border border-line bg-paper">
              {visiblePopular.map((item) => (
                <li
                  key={item.path}
                  className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[0.65rem] text-muted">
                      {item.path}
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs text-muted">
                    {item.views} {item.views === 1 ? "view" : "views"}
                  </span>
                </li>
              ))}
            </ul>
            {canTogglePopular ? (
              <button
                type="button"
                className={`mt-2 text-sm ${adminLinkClass} ${adminFocusRing}`}
                aria-expanded={showAllPopular}
                onClick={() => setShowAllPopular((value) => !value)}
              >
                {showAllPopular ? "Show less" : "View all"}
              </button>
            ) : null}
          </>
        ) : (
          <p className="mt-3 border border-dashed border-line bg-paper px-4 py-6 text-sm text-muted">
            No page views from anonymous visitors in the last 7 days.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="font-serif text-xl text-ink">Recent visitors</h2>
            <p className="mt-1 text-sm text-muted">Times in GMT</p>
          </div>
          <p className="text-sm text-muted">
            <span className="inline-flex items-center gap-2 font-semibold text-ink">
              <PresenceDot online={liveOnlineCount > 0} pulse={liveOnlineCount > 0} />
              {onlineLabel(liveOnlineCount)}
            </span>
            <span className="mt-0.5 block text-xs sm:mt-0 sm:ml-2 sm:inline">
              Active within the last 3 minutes · Updates automatically
            </span>
          </p>
        </div>

        {sorted.length === 0 ? (
          <p className="mt-4 border border-dashed border-line bg-paper px-4 py-8 text-sm text-muted">
            No anonymous visitors yet. Open the public site while signed out to generate traffic.
          </p>
        ) : (
          <>
            <div className="mt-4 hidden border border-line bg-paper md:block">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[22%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <thead className={adminTableHeadClass}>
                  <tr>
                    <th className="px-3 py-3 font-medium">Visitor</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Current / last page</th>
                    <th className="px-3 py-3 font-medium">First seen</th>
                    <th className="px-3 py-3 font-medium">Last seen</th>
                    <th className="px-3 py-3 font-medium">Location</th>
                    <th className="px-3 py-3 font-medium">Device / client</th>
                    <th className="px-3 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((guest) => (
                    <VisitorTableRow
                      key={guest.id}
                      guest={guest}
                      now={now}
                      recipeTitles={titles}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-4 space-y-3 md:hidden">
              {sorted.map((guest) => (
                <VisitorMobileCard
                  key={guest.id}
                  guest={guest}
                  now={now}
                  recipeTitles={titles}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
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
    <div className="border border-line bg-paper px-4 py-3">
      <p className="font-serif text-3xl leading-none text-ink">{value}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function PageCell({ path, recipeTitles }: { path: string; recipeTitles: Map<string, string> }) {
  if (!path) {
    return <span className="text-muted">—</span>;
  }
  const title = guestPathTitle(path, recipeTitles);
  const showPath = title !== path;
  return (
    <div className="min-w-0">
      <p className="break-words text-sm leading-snug text-ink">{title}</p>
      {showPath ? (
        <p className="mt-0.5 break-words font-mono text-[0.65rem] leading-snug text-muted">{path}</p>
      ) : null}
    </div>
  );
}

function LocationCell({ country, city }: { country?: string | null; city?: string | null }) {
  const label = formatCountryCityLocation({ country: country || "", city: city || "" });
  return (
    <span className="block truncate text-xs leading-snug text-muted" title={label === "—" ? undefined : label}>
      {label}
    </span>
  );
}

function VisitorTableRow({
  guest,
  now,
  recipeTitles,
}: {
  guest: GuestRow;
  now: number;
  recipeTitles: Map<string, string>;
}) {
  const online = isMemberOnline(guest.lastSeenAt, now);
  const status = formatPresenceLabel(guest.lastSeenAt, now);
  const shortKey = guest.visitorKey.slice(0, 8);
  const client = classifyGuestClient(guest.userAgent);
  const deviceClient = guestDeviceClientLabel(guest.userAgent);

  return (
    <tr className="border-t border-line align-top hover:bg-cream/40">
      <td className="px-3 py-3">
        <Link href={`/admin/visitors/${guest.id}`} className={`block min-w-0 ${adminFocusRing}`}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink transition-colors hover:text-terracotta">
              Guest {shortKey}
            </span>
            {client.kind === "bot" ? <span className={botBadgeClass}>Bot</span> : null}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-2 text-sm text-ink">
          <PresenceDot online={online} />
          <span className="leading-snug">{status}</span>
        </span>
      </td>
      <td className="px-3 py-3">
        <PageCell path={guest.lastPath} recipeTitles={recipeTitles} />
      </td>
      <td className="px-3 py-3 text-xs leading-snug text-muted">
        {formatAdminShortDateTime(guest.firstSeenAt)}
      </td>
      <td className="px-3 py-3 text-xs leading-snug text-muted">
        {formatAdminShortDateTime(guest.lastSeenAt)}
      </td>
      <td className="px-3 py-3">
        <LocationCell country={guest.country} city={guest.city} />
      </td>
      <td className="px-3 py-3 text-xs leading-snug text-muted">
        <span className="block truncate" title={guest.userAgent}>
          {deviceClient}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <Link
          href={`/admin/visitors/${guest.id}`}
          className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
        >
          View
        </Link>
      </td>
    </tr>
  );
}

function VisitorMobileCard({
  guest,
  now,
  recipeTitles,
}: {
  guest: GuestRow;
  now: number;
  recipeTitles: Map<string, string>;
}) {
  const online = isMemberOnline(guest.lastSeenAt, now);
  const status = formatPresenceLabel(guest.lastSeenAt, now);
  const shortKey = guest.visitorKey.slice(0, 8);
  const client = classifyGuestClient(guest.userAgent);
  const deviceClient = guestDeviceClientLabel(guest.userAgent);
  const location = formatCountryCityLocation({
    country: guest.country || "",
    city: guest.city || "",
  });

  return (
    <li className="border border-line bg-paper px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/visitors/${guest.id}`}
            className={`inline-flex flex-wrap items-center gap-2 font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
          >
            Guest {shortKey}
            {client.kind === "bot" ? <span className={botBadgeClass}>Bot</span> : null}
          </Link>
          <p className="mt-1 inline-flex items-center gap-2 text-sm text-ink">
            <PresenceDot online={online} />
            {status}
          </p>
        </div>
        <Link
          href={`/admin/visitors/${guest.id}`}
          className={`shrink-0 text-sm ${adminLinkClass} ${adminFocusRing}`}
        >
          View
        </Link>
      </div>
      <div className="mt-2">
        <PageCell path={guest.lastPath} recipeTitles={recipeTitles} />
      </div>
      <p className="mt-2 truncate text-xs text-muted" title={location === "—" ? undefined : location}>
        {location}
      </p>
      <p className="mt-1 truncate text-xs text-muted" title={guest.userAgent}>
        {deviceClient}
      </p>
      <p className="mt-1 text-xs text-muted">
        First {formatAdminShortDateTime(guest.firstSeenAt)} · Last{" "}
        {formatAdminShortDateTime(guest.lastSeenAt)}
      </p>
    </li>
  );
}
