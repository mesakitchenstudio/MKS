import { reverse } from "dns/promises";
import type { IpDetails } from "@/lib/ip-details";
import { ipv4ToDecimal, isPublicIp } from "@/lib/ip-utils";

type Ip2LocationResponse = {
  ip?: string;
  country_name?: string;
  region_name?: string;
  city_name?: string;
  latitude?: number;
  longitude?: number;
  asn?: string;
  as?: string;
  isp?: string;
  domain?: string;
  is_proxy?: boolean;
  proxy?: {
    is_vpn?: boolean;
    is_tor?: boolean;
    is_data_center?: boolean;
    is_public_proxy?: boolean;
    is_web_proxy?: boolean;
  };
  error?: { error_code?: number; error_message?: string };
};

type IpApiSupplement = {
  reverse?: string;
  isp?: string;
  org?: string;
};

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

function unavailableDetails(ip: string): IpDetails {
  return {
    ip,
    decimal: ipv4ToDecimal(ip),
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

async function reverseHostname(ip: string) {
  const normalized = ip.replace(/^::ffff:/, "");
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return null;
  try {
    const names = await reverse(normalized);
    return names[0] || null;
  } catch {
    return null;
  }
}

async function fetchIp2Location(ip: string) {
  const apiKey = process.env.IP2LOCATION_API_KEY?.trim();
  const url = new URL("https://api.ip2location.io/");
  if (apiKey) url.searchParams.set("key", apiKey);
  url.searchParams.set("ip", ip);
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as Ip2LocationResponse;
  if (data.error?.error_code) return null;
  return data;
}

async function fetchIpApiSupplement(ip: string) {
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,reverse,isp,org`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as IpApiSupplement & { status?: string };
    if (data.status !== "success") return null;
    return data;
  } catch {
    return null;
  }
}

function formatServices(data: Ip2LocationResponse) {
  const services: string[] = [];
  const proxy = data.proxy;
  if (proxy?.is_vpn) services.push("VPN");
  if (proxy?.is_tor) services.push("Tor");
  if (proxy?.is_public_proxy || proxy?.is_web_proxy) services.push("Proxy");
  else if (data.is_proxy) services.push("Proxy");
  if (proxy?.is_data_center) services.push("Hosting");
  return services.length ? services.join(", ") : "None detected";
}

export async function lookupIpDetails(ip: string): Promise<IpDetails> {
  const trimmed = ip.trim();
  if (!isPublicIp(trimmed)) return localDetails(trimmed);

  try {
    const [geo, hostname] = await Promise.all([fetchIp2Location(trimmed), reverseHostname(trimmed)]);
    if (!geo) return unavailableDetails(trimmed);

    let resolvedHostname = hostname || geo.domain || null;
    let resolvedIsp = geo.isp || geo.as || null;

    if (!resolvedHostname || !resolvedIsp) {
      const supplement = await fetchIpApiSupplement(trimmed);
      if (!resolvedHostname) resolvedHostname = supplement?.reverse || null;
      if (!resolvedIsp) resolvedIsp = supplement?.isp || supplement?.org || null;
    }

    const lat = typeof geo.latitude === "number" ? geo.latitude : null;
    const lon = typeof geo.longitude === "number" ? geo.longitude : null;

    return {
      ip: geo.ip || trimmed,
      decimal: ipv4ToDecimal(geo.ip || trimmed),
      hostname: resolvedHostname || "—",
      asn: geo.asn || "—",
      isp: resolvedIsp || "—",
      services: formatServices(geo),
      country: geo.country_name || "—",
      region: geo.region_name || "—",
      city: geo.city_name || "—",
      latitude: lat,
      longitude: lon,
      latitudeLabel: lat == null ? "—" : formatDms(lat, "lat"),
      longitudeLabel: lon == null ? "—" : formatDms(lon, "lon"),
      mapEmbedUrl: lat != null && lon != null ? mapEmbedUrl(lat, lon) : null,
    };
  } catch {
    return unavailableDetails(trimmed);
  }
}
