export type IpDetails = {
  ip: string;
  decimal: number | null;
  hostname: string;
  asn: string;
  isp: string;
  services: string;
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  latitudeLabel: string;
  longitudeLabel: string;
  mapEmbedUrl: string | null;
};

function isLoopback(ip: string) {
  return (
    !ip ||
    ip === "unknown" ||
    ip === "localhost" ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "::ffff:127.0.0.1"
  );
}

export function isPublicIp(ip: string) {
  if (isLoopback(ip)) return false;
  const normalized = ip.replace(/^::ffff:/, "");
  if (/^10\./.test(normalized)) return false;
  if (/^192\.168\./.test(normalized)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return false;
  if (/^169\.254\./.test(normalized)) return false;
  return true;
}

export function ipv4ToDecimal(ip: string) {
  const normalized = ip.replace(/^::ffff:/, "");
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((total, part) => (total << 8) + part, 0) >>> 0;
}

function formatDms(value: number, kind: "lat" | "lon") {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
  const hemisphere = kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${value.toFixed(4)} (${degrees}° ${minutes}' ${seconds}" ${hemisphere})`;
}

function mapEmbedUrl(lat: number, lon: number) {
  const pad = 0.08;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
}

function localDetails(ip: string): IpDetails {
  return {
    ip,
    decimal: ipv4ToDecimal(ip),
    hostname: "—",
    asn: "—",
    isp: "—",
    services: "Local network",
    country: "—",
    region: "—",
    city: ip === "localhost" ? "Local" : "Private network",
    latitude: null,
    longitude: null,
    latitudeLabel: "—",
    longitudeLabel: "—",
    mapEmbedUrl: null,
  };
}

type IpWhoResponse = {
  success?: boolean;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  connection?: {
    asn?: number;
    org?: string;
    isp?: string;
    domain?: string;
  };
  security?: {
    is_proxy?: boolean;
    is_vpn?: boolean;
    is_tor?: boolean;
    is_hosting?: boolean;
  };
};

export async function lookupIpDetails(ip: string): Promise<IpDetails> {
  const trimmed = ip.trim();
  if (!isPublicIp(trimmed)) return localDetails(trimmed);

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(trimmed)}`, {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) throw new Error("lookup failed");
    const data = (await response.json()) as IpWhoResponse;
    if (!data.success) throw new Error("lookup rejected");

    const lat = typeof data.latitude === "number" ? data.latitude : null;
    const lon = typeof data.longitude === "number" ? data.longitude : null;
    const services = [
      data.security?.is_proxy ? "Proxy" : "",
      data.security?.is_vpn ? "VPN" : "",
      data.security?.is_tor ? "Tor" : "",
      data.security?.is_hosting ? "Hosting" : "",
    ].filter(Boolean);

    return {
      ip: data.ip || trimmed,
      decimal: ipv4ToDecimal(data.ip || trimmed),
      hostname: data.connection?.domain || "—",
      asn: data.connection?.asn ? String(data.connection.asn) : "—",
      isp: data.connection?.isp || data.connection?.org || "—",
      services: services.length ? services.join(", ") : "None detected",
      country: data.country || "—",
      region: data.region || "—",
      city: data.city || "—",
      latitude: lat,
      longitude: lon,
      latitudeLabel: lat == null ? "—" : formatDms(lat, "lat"),
      longitudeLabel: lon == null ? "—" : formatDms(lon, "lon"),
      mapEmbedUrl: lat != null && lon != null ? mapEmbedUrl(lat, lon) : null,
    };
  } catch {
    return {
      ip: trimmed,
      decimal: ipv4ToDecimal(trimmed),
      hostname: "—",
      asn: "—",
      isp: "—",
      services: "Lookup unavailable",
      country: "—",
      region: "—",
      city: "—",
      latitude: null,
      longitude: null,
      latitudeLabel: "—",
      longitudeLabel: "—",
      mapEmbedUrl: null,
    };
  }
}

export function uniqueIps(values: string[]) {
  const seen = new Set<string>();
  const ips: string[] = [];
  for (const value of values) {
    const ip = value.trim();
    if (!ip || ip === "unknown" || seen.has(ip)) continue;
    seen.add(ip);
    ips.push(ip);
  }
  return ips;
}
