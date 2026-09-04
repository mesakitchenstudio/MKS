"use client";

import { useEffect, useId, useState } from "react";
import type { IpDetails } from "@/lib/ip-details";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-line/80 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-semibold text-ink">{label}</dt>
      <dd className="min-w-0 break-all text-sm text-muted">{value}</dd>
    </div>
  );
}

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
          className="min-h-40 h-full w-full border border-line/80 bg-sand lg:min-h-52"
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center border border-line/80 bg-sand text-sm text-muted lg:min-h-52">
          Loading map…
        </div>
      )}
      <a
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=13/${latitude}/${longitude}`}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex min-h-11 items-center text-sm font-semibold text-terracotta hover:underline sm:min-h-9 ${adminFocusRing}`}
      >
        Open map
      </a>
    </div>
  );
}

function MemberIpDiagnostics({ details }: { details: IpDetails }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const rawId = useId();
  const mapId = useId();
  const hasCoordinates =
    typeof details.latitude === "number" &&
    typeof details.longitude === "number" &&
    Number.isFinite(details.latitude) &&
    Number.isFinite(details.longitude);
  const canShowMap = Boolean(details.mapEmbedUrl && hasCoordinates);
  const services = details.services?.trim();
  const showServices =
    Boolean(services) &&
    services !== "—" &&
    !/^none detected$/i.test(services || "");

  return (
    <div className="mt-3 border-t border-line/80 pt-3">
      <dl>
        <DetailRow label="Hostname" value={details.hostname} />
        <DetailRow label="ASN" value={details.asn} />
        <DetailRow label="ISP" value={details.isp} />
        {showServices ? <DetailRow label="Services" value={services!} /> : null}
        <DetailRow label="Country" value={details.country} />
        <DetailRow label="State/region" value={details.region} />
        <DetailRow label="City" value={details.city} />
      </dl>

      <div className="mt-3">
        <button
          type="button"
          className={`min-h-11 text-sm sm:min-h-9 ${adminLinkClass} ${adminFocusRing}`}
          aria-expanded={rawOpen}
          aria-controls={rawId}
          onClick={() => setRawOpen((value) => !value)}
        >
          {rawOpen ? "Hide raw network fields" : "Raw network fields"}
        </button>
        {rawOpen ? (
          <dl id={rawId} className="mt-2">
            <DetailRow
              label="Decimal"
              value={details.decimal == null ? "—" : String(details.decimal)}
            />
            {hasCoordinates ? (
              <>
                <DetailRow label="Latitude" value={details.latitudeLabel} />
                <DetailRow label="Longitude" value={details.longitudeLabel} />
              </>
            ) : (
              <p className="border-t border-line/80 py-2.5 text-sm text-muted">
                No coordinates available.
              </p>
            )}
          </dl>
        ) : null}
      </div>

      {canShowMap ? (
        <div className="mt-3">
          <button
            type="button"
            className={`min-h-11 text-sm sm:min-h-9 ${adminLinkClass} ${adminFocusRing}`}
            aria-expanded={mapOpen}
            aria-controls={mapId}
            onClick={() => setMapOpen((value) => !value)}
          >
            {mapOpen ? "Hide approximate map" : "Show approximate map"}
          </button>
          {mapOpen ? (
            <div id={mapId} className="mt-3">
              <DeferredMapEmbed
                title={`Map for ${details.ip}`}
                src={details.mapEmbedUrl!}
                latitude={details.latitude!}
                longitude={details.longitude!}
              />
              <p className="mt-3 text-[0.7rem] leading-5 text-muted">
                Latitude and longitude are approximate and not precise enough to identify a
                specific address.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {details.services === "Local network"
            ? "Location data is unavailable for local addresses."
            : "Location data is unavailable for this address."}
        </p>
      )}
    </div>
  );
}

function MemberIpRow({ ip, canEnrich }: { ip: string; canEnrich: boolean }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<IpDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const panelId = useId();

  async function loadDiagnostics() {
    if (!canEnrich || details || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/ip?address=${encodeURIComponent(ip)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as IpDetails & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load IP details.");
      setDetails(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load IP details.");
    } finally {
      setLoading(false);
    }
  }

  const summary =
    details && !error
      ? [
          [details.city, details.country].filter((part) => part && part !== "—").join(", "),
          details.isp && details.isp !== "—" ? details.isp : "",
          details.asn && details.asn !== "—" ? `ASN ${details.asn.replace(/^AS/i, "")}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <li className="border-b border-line/80 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="break-all font-mono text-sm text-ink">{ip}</p>
          {summary ? <p className="mt-0.5 text-xs text-muted">{summary}</p> : null}
        </div>
        {canEnrich ? (
          <button
            type="button"
            className={`min-h-11 shrink-0 text-sm sm:min-h-9 ${adminLinkClass} ${adminFocusRing}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              const next = !open;
              setOpen(next);
              if (next) void loadDiagnostics();
            }}
          >
            {open ? "Hide diagnostics" : "Diagnostics"}
          </button>
        ) : null}
      </div>
      {canEnrich && open ? (
        <div id={panelId}>
          {loading ? <p className="mt-3 text-sm text-muted">Loading details…</p> : null}
          {error ? <p className="mt-3 text-sm text-terracotta">{error}</p> : null}
          {details && !loading ? <MemberIpDiagnostics details={details} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Members-only network disclosure.
 * Does not alter Visitors' VisitorNetworkSection.
 * Enrichment/map controls only when canEnrich (Owner /api/admin/ip).
 */
export function MemberNetworkSection({
  ips,
  userAgent,
  referrer,
  canEnrich,
}: {
  ips: string[];
  userAgent?: string;
  referrer?: string;
  canEnrich: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ua = userAgent?.trim() || "";
  const ref = referrer?.trim() || "";

  return (
    <section className="mt-10 border-y border-line/80 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-serif text-xl text-ink">Network details</h2>
        <button
          type="button"
          className={`min-h-11 text-sm sm:min-h-9 ${adminLinkClass} ${adminFocusRing}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="mt-4 space-y-5">
          {ua ? (
            <div>
              <p className="text-sm font-semibold text-ink">User-Agent</p>
              <p className="mt-1 break-all font-mono text-xs leading-relaxed text-muted">{ua}</p>
            </div>
          ) : null}
          {ref ? (
            <div>
              <p className="text-sm font-semibold text-ink">Latest referrer</p>
              <p className="mt-1 break-all text-sm text-muted">{ref}</p>
            </div>
          ) : null}
          <div>
            <p className="text-sm font-semibold text-ink">
              IP addresses
              <span className="ml-2 font-normal text-muted">· {ips.length}</span>
            </p>
            {ips.length ? (
              <ul className="mt-2 border-t border-line/80">
                {ips.map((ip) => (
                  <MemberIpRow key={ip} ip={ip} canEnrich={canEnrich} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">None recorded</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">IP, ISP/ASN, user-agent, and map.</p>
      )}
    </section>
  );
}
