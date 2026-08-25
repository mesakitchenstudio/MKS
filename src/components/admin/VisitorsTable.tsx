"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IpDetailsPanel } from "@/components/admin/IpDetailsPanel";
import { formatGmtDateTime } from "@/lib/datetime";
import { isMemberOnline } from "@/lib/member-presence";
import { uniqueIps } from "@/lib/ip-utils";
import { formatBrowser, formatLocation } from "@/lib/request-meta";

type PageViewRow = {
  id: string;
  path: string;
  referer: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  userAgent: string;
  createdAt: Date | string;
};

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
  pageViews: PageViewRow[];
};

export function VisitorsTable({
  visitors,
  popularPaths,
}: {
  visitors: GuestRow[];
  popularPaths: { path: string; views: number }[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openIpId, setOpenIpId] = useState<string | null>(null);
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

  const onlineCount = sorted.filter((guest) => isMemberOnline(guest.lastSeenAt, now)).length;

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center gap-3 border border-line bg-paper px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-olive opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-olive" />
          </span>
          {onlineCount} guest{onlineCount === 1 ? "" : "s"} online now
        </span>
        <span className="text-xs text-muted">
          Unsigned visitors · last 3 minutes · GMT · updates automatically
        </span>
      </div>

      {popularPaths.length ? (
        <section>
          <h2 className="font-serif text-2xl">Popular pages (7 days)</h2>
          <p className="mt-1 text-sm text-muted">Guest page views only — signed-in members are excluded.</p>
          <ul className="mt-4 divide-y divide-line border border-line bg-paper">
            {popularPaths.map((item) => (
              <li key={item.path} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="font-mono text-xs sm:text-sm">{item.path}</span>
                <span className="shrink-0 text-xs font-semibold text-muted">{item.views} views</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="overflow-x-auto border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/50 text-[0.65rem] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Visitor</th>
              <th className="px-4 py-3">On page</th>
              <th className="px-4 py-3">First seen</th>
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3">Where</th>
              <th className="px-4 py-3">Browser</th>
              <th className="px-4 py-3">Pages</th>
              <th className="px-4 py-3">IP details</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((guest, index) => {
              const online = isMemberOnline(guest.lastSeenAt, now);
              const ips = uniqueIps([
                guest.ip,
                ...guest.pageViews.map((view) => view.ip),
              ]);
              const historyOpen = openId === guest.id;
              const ipOpen = openIpId === guest.id;
              const shortKey = guest.visitorKey.slice(0, 8);

              return (
                <Fragment key={guest.id}>
                  <tr className="border-t border-line align-top">
                    <td className="px-4 py-3 text-muted">{index + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                          online ? "text-olive" : "text-muted"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${online ? "bg-olive" : "bg-line"}`} />
                        {online ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">Guest {shortKey}</p>
                      <p className="font-mono text-[0.65rem] text-muted">{guest.visitorKey}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{guest.lastPath || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {formatGmtDateTime(guest.firstSeenAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {formatGmtDateTime(guest.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      {formatLocation(guest) || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted" title={guest.userAgent}>
                      {formatBrowser(guest.userAgent)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {guest.pageViews.length ? (
                        <button
                          type="button"
                          onClick={() => setOpenId(historyOpen ? null : guest.id)}
                          className="text-xs font-semibold text-terracotta hover:underline"
                        >
                          {historyOpen ? "Hide" : "Show"} history
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ips.length ? (
                        <button
                          type="button"
                          onClick={() => setOpenIpId(ipOpen ? null : guest.id)}
                          className="text-xs font-semibold text-terracotta hover:underline"
                        >
                          {ipOpen ? "Hide" : "Show"} {ips.length} IP{ips.length === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                  {historyOpen ? (
                    <tr className="border-t border-line bg-cream/40">
                      <td colSpan={10} className="px-4 py-5">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                          Recent pages
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="text-muted">
                              <tr>
                                <th className="py-2 pr-4">When</th>
                                <th className="py-2 pr-4">Path</th>
                                <th className="py-2 pr-4">Referrer</th>
                                <th className="py-2">Where</th>
                              </tr>
                            </thead>
                            <tbody>
                              {guest.pageViews.map((view) => (
                                <tr key={view.id} className="border-t border-line/70">
                                  <td className="py-2 pr-4 whitespace-nowrap">
                                    {formatGmtDateTime(view.createdAt)}
                                  </td>
                                  <td className="py-2 pr-4 font-mono">{view.path}</td>
                                  <td className="py-2 pr-4 text-muted">
                                    {view.referer || "—"}
                                  </td>
                                  <td className="py-2">{formatLocation(view) || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {ipOpen && ips.length ? (
                    <tr className="border-t border-line bg-cream/40">
                      <td colSpan={10} className="px-4 py-5">
                        <div className="grid gap-4">
                          {ips.map((ip) => (
                            <IpDetailsPanel key={`${guest.id}-${ip}`} ip={ip} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-muted">
                  No guest visitors yet. Open the public site in a private window (signed out) to
                  generate traffic.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
