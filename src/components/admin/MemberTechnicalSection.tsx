"use client";

import { useId, useState } from "react";
import { IpDetailsPanel } from "@/components/admin/IpDetailsPanel";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { formatAdminDateTime } from "@/lib/datetime";
import { formatSignInMethod } from "@/lib/member-presence";
import { formatLocation, formatReferrerDisplay } from "@/lib/request-meta";

type Connection = {
  id: string;
  ip: string;
  event: string;
  method: string;
  userAgent: string;
  city: string;
  region: string;
  country: string;
  referer: string;
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

export function MemberTechnicalSection({
  where,
  browser,
  referer,
  ips,
  connections,
}: {
  where: string;
  browser: string;
  referer: string;
  ips: string[];
  connections: Connection[];
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
          <dt className="text-sm font-semibold text-ink">Browser</dt>
          <dd className="min-w-0 text-sm text-muted">{browser}</dd>
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
            Connection history
            <span className="font-normal text-muted"> · {connections.length}</span>
          </p>
          {connections.length ? (
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
        {showHistory && connections.length ? (
          <ul id={historyId} className="mb-1 divide-y divide-line border border-line">
            {connections.map((connection) => {
              const place = formatLocation(connection);
              const meta = [
                connection.ip && connection.ip !== "unknown" ? connection.ip : null,
                place || null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={connection.id} className="px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-semibold text-ink">
                      {connection.event === "signup" ? "Signup" : "Sign-in"} ·{" "}
                      {formatSignInMethod(connection.method)}
                    </p>
                    <p className="text-xs text-muted sm:text-right">
                      {formatAdminDateTime(connection.createdAt)}
                    </p>
                  </div>
                  {meta ? <p className="mt-0.5 text-xs text-muted">{meta}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
