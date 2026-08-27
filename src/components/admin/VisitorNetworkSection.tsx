"use client";

import { useId, useState } from "react";
import { IpDetailsPanel } from "@/components/admin/IpDetailsPanel";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";

/** Collapsed-by-default IP / map details for visitor admin pages. */
export function VisitorNetworkSection({ ips }: { ips: string[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section className="mt-10 border border-line bg-paper px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-serif text-xl text-ink">
          IP addresses
          <span className="ml-2 font-sans text-sm font-normal text-muted">· {ips.length}</span>
        </h2>
        {ips.length ? (
          <button
            type="button"
            className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide details" : "Show details"}
          </button>
        ) : (
          <span className="text-sm text-muted">None recorded</span>
        )}
      </div>

      {open && ips.length ? (
        <div id={panelId} className="mt-4 grid gap-4">
          {ips.map((ip) => (
            <IpDetailsPanel key={ip} ip={ip} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
