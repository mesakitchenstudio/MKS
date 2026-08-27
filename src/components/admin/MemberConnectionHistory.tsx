"use client";

import { useId, useState } from "react";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { formatAdminShortDateTime } from "@/lib/datetime";
import { guestDeviceClientLabel } from "@/lib/guest-client";
import { formatSignInMethod } from "@/lib/member-presence";
import { formatApproxLocation } from "@/lib/request-meta";

type Connection = {
  id: string;
  ip: string;
  event: string;
  method: string;
  userAgent: string;
  city: string;
  region: string;
  country: string;
  createdAt: Date | string;
};

function connectionSecondaryLine(connection: Connection) {
  const device = guestDeviceClientLabel(connection.userAgent || "");
  const place = formatApproxLocation(connection);
  // Keep IPs in the dedicated IP diagnostics section, not the history summary.
  return [device && device !== "Unknown" ? device : null, place || null]
    .filter(Boolean)
    .join(" · ");
}

/** Collapsed-by-default connection history for member admin detail. */
export function MemberConnectionHistory({
  connections,
  totalCount,
}: {
  connections: Connection[];
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = totalCount || connections.length;

  return (
    <section className="mt-10 border border-line bg-paper px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-serif text-xl text-ink">
          Connection history
          <span className="ml-2 font-sans text-sm font-normal text-muted">· {count}</span>
        </h2>
        {connections.length ? (
          <button
            type="button"
            className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide history" : "Show history"}
          </button>
        ) : (
          <span className="text-sm text-muted">None recorded</span>
        )}
      </div>

      {open && connections.length ? (
        <ul id={panelId} className="mt-4 divide-y divide-line border border-line">
          {connections.map((connection) => {
            const eventLabel = connection.event === "signup" ? "Signup" : "Sign-in";
            const meta = connectionSecondaryLine(connection);

            return (
              <li key={connection.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {eventLabel} · {formatSignInMethod(connection.method)}
                    </p>
                    {meta ? <p className="mt-0.5 break-words text-xs text-muted">{meta}</p> : null}
                  </div>
                  <p className="shrink-0 text-xs text-muted sm:pt-0.5 sm:text-right">
                    {formatAdminShortDateTime(connection.createdAt, new Date(), {
                      includeYear: true,
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
