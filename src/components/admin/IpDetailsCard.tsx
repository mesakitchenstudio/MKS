import type { IpDetails } from "@/lib/ip-details";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

export function IpDetailsCard({ details }: { details: IpDetails }) {
  return (
    <div className="overflow-hidden border border-line bg-paper text-ink shadow-sm">
      <div className="border-b border-line bg-cream px-4 py-3">
        <p className="text-sm font-semibold text-ink">IP details for: {details.ip}</p>
      </div>
      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <dl className="space-y-3">
          <DetailRow label="Decimal" value={details.decimal == null ? "—" : String(details.decimal)} />
          <DetailRow label="Hostname" value={details.hostname} />
          <DetailRow label="ASN" value={details.asn} />
          <DetailRow label="ISP" value={details.isp} />
          <DetailRow label="Services" value={details.services} />
          <DetailRow label="Country" value={details.country} />
          <DetailRow label="State/Region" value={details.region} />
          <DetailRow label="City" value={details.city} />
          <DetailRow label="Latitude" value={details.latitudeLabel} />
          <DetailRow label="Longitude" value={details.longitudeLabel} />
        </dl>
        <div className="grid gap-3">
          {details.mapEmbedUrl ? (
            <iframe
              title={`Map for ${details.ip}`}
              src={details.mapEmbedUrl}
              className="h-48 w-full border border-line bg-sand"
              loading="lazy"
            />
          ) : (
            <div className="flex h-48 items-center justify-center border border-line bg-cream px-4 text-center text-sm text-muted">
              Map unavailable for this address.
            </div>
          )}
          <a
            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(details.ip)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-center text-xs font-semibold uppercase tracking-wide text-terracotta hover:underline"
          >
            Open map search
          </a>
        </div>
      </div>
      <p className="border-t border-line bg-cream px-4 py-3 text-[0.7rem] leading-5 text-muted">
        Latitude and longitude are approximate and not precise enough to identify a specific
        address. IP data from IP2Location.
      </p>
    </div>
  );
}
