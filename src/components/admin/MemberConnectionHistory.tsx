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
  const placeLabel = place ? `${place} (approx.)` : null;
  return [device && device !== "Unknown" ? device : null, placeLabel]
    .filter(Boolean)
    .join(" · ");
}

/** Collapsed-by-default account activity (auth events) for member admin detail. */
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
    <section className="mt-10 border-y border-line/80 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-serif text-xl text-ink">
          Account activity
          <span className="ml-2 font-sans text-sm font-normal text-muted">· {count}</span>
        </h2>
        {connections.length ? (
          <button
            type="button"
            className={`min-h-11 text-sm sm:min-h-9 ${adminLinkClass} ${adminFocusRing}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide" : "Show"}
          </button>
        ) : (
          <span className="text-sm text-muted">None recorded</span>
        )}
      </div>

      {open && connections.length ? (
        <div id={panelId} className="mt-4">
          <p className="text-xs text-muted">Newest first · Times in GMT</p>
          <ul className="mt-3 divide-y divide-line/80 border-t border-line/80">
            {connections.map((connection) => {
              const eventLabel = connection.event === "signup" ? "Signup" : "Sign-in";
              const meta = connectionSecondaryLine(connection);

              return (
                <li key={connection.id} className="py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {eventLabel} · {formatSignInMethod(connection.method)}
                      </p>
                      {meta ? (
                        <p className="mt-0.5 break-words text-xs text-muted">{meta}</p>
                      ) : null}
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
        </div>
      ) : null}
    </section>
  );
}
