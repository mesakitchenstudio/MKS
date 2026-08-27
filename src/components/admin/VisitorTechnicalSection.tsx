"use client";

import { useId, useState } from "react";
import { IpDetailsPanel } from "@/components/admin/IpDetailsPanel";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { formatAdminDateTime } from "@/lib/datetime";
import { formatLocation, formatReferrerDisplay } from "@/lib/request-meta";

type PageView = {
  id: string;
  path: string;
  referer: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  createdAt: Date | string;
};

function DisclosureToggle({
  open,
  onToggle,
  controls,
  openLabel,
  closedLabel,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  openLabel: string;
  closedLabel: string;
}) {
  return (
    <button
      type="button"
      className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {open ? openLabel : closedLabel}
    </button>
  );
}

export function VisitorTechnicalSection({
  where,
  browser,
  clientKind,
  userAgent,
  referer,
  ips,
  pageViews,
}: {
  where: string;
  browser: string;
  clientKind?: string;
  userAgent?: string;
  referer: string;
  ips: string[];
  pageViews: PageView[];
}) {
  const [showIps, setShowIps] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const ipsId = useId();
  const historyId = useId();
  const referrerDisplay = formatReferrerDisplay(referer);

  return (
    <section className="mt-6 border border-line bg-paper p-5 md:p-6">
      <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Technical
      </h2>
      <dl className="mt-2">
        <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-sm font-semibold text-ink">Where</dt>
          <dd className="min-w-0 text-sm text-muted">{where}</dd>
        </div>
        <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-sm font-semibold text-ink">Classification</dt>
          <dd className="min-w-0 text-sm text-muted">{clientKind || "Visitor"}</dd>
        </div>
        <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-sm font-semibold text-ink">Device / client</dt>
          <dd className="min-w-0 text-sm text-muted">{browser}</dd>
        </div>
        <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-sm font-semibold text-ink">User agent</dt>
          <dd className="min-w-0 break-all font-mono text-xs text-muted">{userAgent || "—"}</dd>
        </div>
        <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-sm font-semibold text-ink">Latest referrer</dt>
          <dd className="min-w-0 break-all text-sm text-muted" title={referrerDisplay.title}>
            {referrerDisplay.label}
          </dd>
        </div>
      </dl>

      <div className="mt-2 border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <p className="text-sm font-semibold text-ink">
            IP addresses
            <span className="font-normal text-muted"> · {ips.length}</span>
          </p>
          {ips.length ? (
            <DisclosureToggle
              open={showIps}
              onToggle={() => setShowIps((value) => !value)}
              controls={ipsId}
              openLabel="Hide details"
              closedLabel="Show details"
            />
          ) : (
            <span className="text-sm text-muted">None recorded</span>
          )}
        </div>
        {showIps && ips.length ? (
          <div id={ipsId} className="grid gap-4 pb-4">
            {ips.map((ip) => (
              <IpDetailsPanel key={ip} ip={ip} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <p className="text-sm font-semibold text-ink">
            Page history
            <span className="font-normal text-muted"> · {pageViews.length}</span>
          </p>
          {pageViews.length ? (
            <DisclosureToggle
              open={showHistory}
              onToggle={() => setShowHistory((value) => !value)}
              controls={historyId}
              openLabel="Hide history"
              closedLabel="Show history"
            />
          ) : (
            <span className="text-sm text-muted">None recorded</span>
          )}
        </div>
        {showHistory && pageViews.length ? (
          <ul id={historyId} className="mb-1 divide-y divide-line border border-line">
            {pageViews.map((view) => {
              const place = formatLocation(view);
              return (
                <li key={view.id} className="px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 break-all font-mono text-xs font-semibold text-ink sm:text-sm">
                      {view.path}
                    </p>
                    <p className="text-xs text-muted sm:text-right">
                      {formatAdminDateTime(view.createdAt)}
                    </p>
                  </div>
                  {place ? <p className="mt-0.5 text-xs text-muted">{place}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
