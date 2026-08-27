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
  const hasCoordinates = details.latitude != null && details.longitude != null;
  const showMap = Boolean(details.mapEmbedUrl && hasCoordinates);

  return (
    <div className="overflow-hidden border border-line bg-paper text-ink">
      <div className="border-b border-line bg-cream px-4 py-3">
        <p className="text-sm font-semibold text-ink">IP details for: {details.ip}</p>
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
          <div className="grid gap-3">
            <iframe
              title={`Map for ${details.ip}`}
              src={details.mapEmbedUrl!}
              className="min-h-72 h-full w-full border border-line bg-sand lg:min-h-[22rem]"
              loading="lazy"
            />
            <a
              href={`https://www.openstreetmap.org/?mlat=${details.latitude}&mlon=${details.longitude}#map=14/${details.latitude}/${details.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-center text-xs font-semibold uppercase tracking-wide text-terracotta hover:underline"
            >
              Open map
            </a>
          </div>
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
          address. IP data from IP2Location.
        </p>
      ) : null}
    </div>
  );
}
