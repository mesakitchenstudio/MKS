"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { formatAdminDateTime } from "@/lib/datetime";
import { formatPresenceLabel, isMemberOnline } from "@/lib/member-presence";
import { formatBrowser } from "@/lib/request-meta";

type GuestRow = {
  id: string;
  visitorKey: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  lastPath: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  userAgent: string;
};

export function VisitorsTable({
  visitors,
  popularPaths,
}: {
  visitors: GuestRow[];
  popularPaths: { path: string; views: number }[];
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

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

  const [showAllPopular, setShowAllPopular] = useState(false);
  const onlineCount = sorted.filter((guest) => isMemberOnline(guest.lastSeenAt, now)).length;
  const popularPreviewLimit = 5;
  const visiblePopular = showAllPopular
    ? popularPaths
    : popularPaths.slice(0, popularPreviewLimit);
  const canTogglePopular = popularPaths.length > popularPreviewLimit;

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-paper px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <PresenceDot online={onlineCount > 0} pulse={onlineCount > 0} />
          {onlineCount} guest{onlineCount === 1 ? "" : "s"} online now
        </span>
        <span className="text-xs text-muted">
          Unsigned visitors · Last 3 minutes · GMT · Updates automatically
        </span>
      </div>

      <div className="overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-4 py-3 font-medium">Visitor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Current / last page</th>
              <th className="px-4 py-3 font-medium">First seen</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Browser</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((guest) => {
              const online = isMemberOnline(guest.lastSeenAt, now);
              const status = formatPresenceLabel(guest.lastSeenAt, now);
              const shortKey = guest.visitorKey.slice(0, 8);
              const page = guest.lastPath || "—";

              return (
                <tr key={guest.id} className="border-t border-line align-middle hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/visitors/${guest.id}`}
                      className={`block min-w-0 ${adminFocusRing}`}
                    >
                      <span className="block truncate font-semibold text-ink transition-colors hover:text-terracotta">
                        Guest {shortKey}
                      </span>
                      <span className="block truncate font-mono text-[0.65rem] text-muted">
                        {guest.visitorKey}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <PresenceDot online={online} />
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{page}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatAdminDateTime(guest.firstSeenAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatAdminDateTime(guest.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted" title={guest.userAgent}>
                    {formatBrowser(guest.userAgent)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <Link
                      href={`/admin/visitors/${guest.id}`}
                      className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-muted">
                  No guest visitors yet. Open the public site in a private window (signed out) to
                  generate traffic.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {popularPaths.length ? (
        <section className="mt-8">
          <h2 className="font-serif text-xl text-ink">Popular pages</h2>
          <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            Last 7 days
          </p>
          <p className="mt-1 text-sm text-muted">
            Guest page views only. Signed-in members are excluded.
          </p>
          <ul className="mt-3 divide-y divide-line border border-line bg-paper">
            {visiblePopular.map((item) => (
              <li
                key={item.path}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-mono text-xs text-ink sm:text-sm">
                  {item.path}
                </span>
                <span className="shrink-0 text-xs text-muted">
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
        </section>
      ) : null}
    </div>
  );
}
