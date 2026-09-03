"use client";

import { useId, useState } from "react";
import { IpDetailsPanel } from "@/components/admin/IpDetailsPanel";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";

/** Collapsed-by-default network / technical details for visitor admin pages. */
export function VisitorNetworkSection({
  ips,
  visitorKey,
  userAgent,
  activeConnections,
}: {
  ips: string[];
  visitorKey?: string;
  userAgent?: string;
  /** Shown only when the caller opts in (e.g. online with active tabs). */
  activeConnections?: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section className="border border-line bg-paper px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-serif text-xl text-ink">Network &amp; technical details</h2>
        <button
          type="button"
          className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="mt-4 space-y-4">
          {visitorKey ? (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                Visitor UUID
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted">{visitorKey}</p>
            </div>
          ) : null}
          {typeof activeConnections === "number" ? (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                Active tabs
              </p>
              <p className="mt-1 text-sm text-muted">{activeConnections}</p>
            </div>
          ) : null}
          {userAgent?.trim() ? (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                User-Agent
              </p>
              <p className="mt-1 break-all font-mono text-xs leading-relaxed text-muted">
                {userAgent.trim()}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
              IP addresses · {ips.length}
            </p>
            {ips.length ? (
              <div className="mt-3 grid gap-4">
                {ips.map((ip) => (
                  <IpDetailsPanel key={ip} ip={ip} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">None recorded</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          UUID, raw IP, ISP/ASN, User-Agent, and map stay hidden until expanded.
        </p>
      )}
    </section>
  );
}
