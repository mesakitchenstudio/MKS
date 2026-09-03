import { classifyGuestClient } from "@/lib/guest-client";

export type ConnectionMeta = {
  ip: string;
  country: string;
  city: string;
  region: string;
  userAgent: string;
  referer: string;
};

function readHeader(headers: unknown, name: string) {
  if (!headers || typeof headers !== "object") return "";
  try {
    const getter = (headers as Headers).get;
    if (typeof getter === "function") {
      return getter.call(headers, name)?.trim() || "";
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const value = record[name] ?? record[name.toLowerCase()];
    if (Array.isArray(value)) return String(value[0] ?? "").trim() || "";
    return String(value ?? "").trim() || "";
  } catch {
    return "";
  }
}

/** First value only — for comma-separated hop lists like x-forwarded-for. */
function readHeaderFirst(headers: unknown, name: string) {
  return readHeader(headers, name).split(",")[0]?.trim() || "";
}

function decodeHeader(value: string) {
  if (!value) return "";
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function isLoopback(value: string) {
  return (
    value === "unknown" ||
    value === "::1" ||
    value === "127.0.0.1" ||
    value === "::ffff:127.0.0.1" ||
    value === "localhost"
  );
}

export function connectionMeta(headers?: unknown): ConnectionMeta {
  if (!headers) {
    return {
      ip: "unknown",
      country: "",
      city: "",
      region: "",
      userAgent: "",
      referer: "",
    };
  }

  const host = readHeader(headers, "host") || readHeader(headers, "x-forwarded-host");
  const forwarded =
    readHeaderFirst(headers, "x-forwarded-for") ||
    readHeaderFirst(headers, "x-real-ip") ||
    readHeaderFirst(headers, "cf-connecting-ip") ||
    readHeaderFirst(headers, "x-vercel-forwarded-for");
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  let ip = forwarded || (localHost ? "localhost" : "unknown");
  if (isLoopback(ip) || localHost) ip = "localhost";

  const country = decodeHeader(
    readHeaderFirst(headers, "x-vercel-ip-country") || readHeaderFirst(headers, "cf-ipcountry"),
  );
  const city = decodeHeader(readHeader(headers, "x-vercel-ip-city"));
  const region = decodeHeader(readHeader(headers, "x-vercel-ip-country-region"));

  return {
    ip,
    country,
    city: city || (ip === "localhost" ? "Local" : ""),
    region,
    // Never fall back to sec-ch-ua — it is not a User-Agent and breaks bot/browser labels.
    userAgent: readHeader(headers, "user-agent"),
    referer: readHeader(headers, "referer") || readHeader(headers, "origin"),
  };
}

export function formatIp(ip: string) {
  if (!ip || isLoopback(ip)) return "localhost";
  return ip;
}

export function formatLocation(meta: { city?: string; region?: string; country?: string; ip?: string }) {
  const location = [meta.city, meta.region, meta.country].filter(Boolean).join(", ");
  if (location) return location;
  if (meta.ip && isLoopback(meta.ip)) return "Local";
  return "";
}

/** Human-readable approx. place for admin UI (skips cryptic region codes like "34"). */
export function formatApproxLocation(meta: {
  city?: string;
  region?: string;
  country?: string;
  ip?: string | null;
}) {
  const city = cleanPlacePart(meta.city);
  const region = cleanPlacePart(meta.region);
  const countryRaw = cleanPlacePart(meta.country);
  const country = countryDisplayName(countryRaw);
  const regionLooksLikeCode = Boolean(
    region && (/^\d+$/.test(region) || /^[A-Z0-9]{1,3}$/i.test(region)),
  );
  const namedRegion = region && !regionLooksLikeCode && region.toLowerCase() !== city.toLowerCase()
    ? region
    : "";

  if (city && namedRegion && country) return `${city}, ${namedRegion}, ${country}`;
  if (city && country) return `${city}, ${country}`;
  if (city && namedRegion) return `${city}, ${namedRegion}`;
  if (city) return city;
  if (namedRegion && country) return `${namedRegion}, ${country}`;
  if (country) return country;
  // Do not surface "Local" for loopback/unknown IPs — omit until real place data exists.
  return "";
}

/**
 * Compact list-table location: "Country · City".
 * Shared by Visitors and Members overview tables (not detail pages).
 */
export function formatCountryCityLocation(meta: { city?: string; country?: string } | null | undefined) {
  if (!meta) return "—";
  const city = cleanPlacePart(meta.city);
  const country = countryDisplayName(cleanPlacePart(meta.country));
  if (country && city) return `${country} · ${city}`;
  if (country) return country;
  if (city) return city;
  return "—";
}

/** First connection (newest-first) that has a usable country/city. */
export function pickLatestLocationConnection<T extends { city?: string; country?: string }>(
  connections: T[] | null | undefined,
): T | null {
  if (!connections?.length) return null;
  for (const connection of connections) {
    if (formatCountryCityLocation(connection) !== "—") return connection;
  }
  return null;
}

/** Compact list label from newest connection with a usable place. */
export function formatLatestCountryCityLocation(
  connections: Array<{ city?: string; country?: string }> | null | undefined,
) {
  return formatCountryCityLocation(pickLatestLocationConnection(connections));
}

function cleanPlacePart(value?: string) {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  if (trimmed === "—") return "";
  if (/^(local|localhost|unknown|private network)$/i.test(trimmed)) return "";
  return trimmed;
}

function countryDisplayName(codeOrName: string) {
  if (!codeOrName) return "";
  if (codeOrName.length !== 2) return codeOrName;
  const upper = codeOrName.toUpperCase();
  // Prefer the official short name when Intl still returns "Turkey".
  if (upper === "TR") return "Türkiye";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(upper) || codeOrName;
  } catch {
    return codeOrName;
  }
}

export function formatBrowser(userAgent: string) {
  const { label } = classifyGuestClient(userAgent);
  return label;
}

/** Prefer a short host label; keep the full URL for title/tooltip. */
export function formatReferrerDisplay(referer: string) {
  if (!referer) return { label: "—", title: undefined as string | undefined };
  try {
    const url = new URL(referer);
    if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
      return { label: "localhost", title: referer };
    }
    return { label: url.hostname, title: referer };
  } catch {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(referer)) {
      return { label: "localhost", title: referer };
    }
  }
  return { label: referer, title: referer.length > 80 ? referer : undefined };
}
