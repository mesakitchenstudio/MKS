"use client";

import { useEffect, useState } from "react";
import type { IpDetails } from "@/lib/ip-details";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-sm text-ink">{value}</dd>
    </div>
  );
}

/** OSM embed that mounts only after layout so hidden disclosure panels get correct framing. */
function DeferredMapEmbed({
  title,
  src,
  latitude,
  longitude,
}: {
  title: string;
  src: string;
  latitude: number;
  longitude: number;
}) {
  const [readySrc, setReadySrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) setReadySrc(src);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [src]);

  return (
    <div className="grid gap-3">
      {readySrc ? (
        <iframe
          title={title}
          src={readySrc}
          className="min-h-48 h-full w-full border border-line bg-sand lg:min-h-64"
        />
      ) : (
        <div className="flex min-h-48 items-center justify-center border border-line bg-sand text-sm text-muted lg:min-h-64">
          Loading map…
        </div>
      )}
      <a
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=13/${latitude}/${longitude}`}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-center text-xs font-semibold uppercase tracking-wide text-terracotta hover:underline"
      >
        Open map
      </a>
    </div>
  );
}

export function IpDetailsCard({ details }: { details: IpDetails }) {
  const hasCoordinates =
    typeof details.latitude === "number" &&
    typeof details.longitude === "number" &&
    Number.isFinite(details.latitude) &&
    Number.isFinite(details.longitude);
  const showMap = Boolean(details.mapEmbedUrl && hasCoordinates);

  return (
    <div className="overflow-hidden border border-line bg-paper text-ink">
      <div className="border-b border-line bg-cream px-4 py-3">
        <p className="break-all text-sm font-semibold text-ink">IP details for: {details.ip}</p>
      </div>
      <div className={`grid gap-6 p-4 ${showMap ? "lg:grid-cols-2 lg:items-stretch" : ""}`}>
        <dl className="space-y-3">
          <DetailRow label="Decimal" value={details.decimal == null ? "—" : String(details.decimal)} />
          <DetailRow label="Hostname" value={details.hostname} />
          <DetailRow label="ASN" value={details.asn} />
          <DetailRow label="ISP" value={details.isp} />
          <DetailRow label="Services" value={details.services} />
          <DetailRow label="Country" value={details.country} />
          <DetailRow label="State/Region" value={details.region} />
          <DetailRow label="City" value={details.city} />
          {hasCoordinates ? (
            <>
              <DetailRow label="Latitude" value={details.latitudeLabel} />
              <DetailRow label="Longitude" value={details.longitudeLabel} />
            </>
          ) : null}
        </dl>
        {showMap ? (
          <DeferredMapEmbed
            title={`Map for ${details.ip}`}
            src={details.mapEmbedUrl!}
            latitude={details.latitude!}
            longitude={details.longitude!}
          />
        ) : (
          <p className="border border-line bg-cream px-4 py-3 text-sm text-muted">
            {details.services === "Local network"
              ? "Location data is unavailable for local addresses."
              : "Location data is unavailable for this address."}
          </p>
        )}
      </div>
      {showMap ? (
        <p className="border-t border-line bg-cream px-4 py-3 text-[0.7rem] leading-5 text-muted">
          Latitude and longitude are approximate and not precise enough to identify a specific
          address.
        </p>
      ) : null}
    </div>
  );
}
