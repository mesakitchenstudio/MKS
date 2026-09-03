import { site } from "@/data/site";

export const GUEST_TRAFFIC_SOURCES = [
  "youtube",
  "google",
  "pinterest",
  "instagram",
  "facebook",
  "direct",
  "other",
] as const;

export type GuestTrafficSource = (typeof GUEST_TRAFFIC_SOURCES)[number];

export type GuestPageViewRefererRow = {
  path: string;
  referer: string;
  createdAt: Date | string;
};

const MESA_HOSTS = new Set(
  [
    site.domain,
    `www.${site.domain}`,
    "localhost",
    "127.0.0.1",
  ].map((host) => host.toLowerCase()),
);

function tryParseUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

export function refererHostname(referer: string): string {
  const url = tryParseUrl(referer);
  return url?.hostname.replace(/^www\./i, "").toLowerCase() || "";
}

/** True when the referrer is Mesa itself (or local). */
export function isInternalMesaReferer(referer: string): boolean {
  const host = refererHostname(referer);
  if (!host) return false;
  if (MESA_HOSTS.has(host)) return true;
  return host.endsWith(`.${site.domain.toLowerCase()}`);
}

export function classifyExternalTrafficSource(referer: string): GuestTrafficSource | "internal" {
  const trimmed = referer.trim();
  if (!trimmed) return "direct";
  if (isInternalMesaReferer(trimmed)) return "internal";

  const host = refererHostname(trimmed);
  if (!host) return "other";

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  ) {
    return "youtube";
  }
  if (host === "google.com" || host.endsWith(".google.com") || host.startsWith("google.")) {
    return "google";
  }
  if (host === "pinterest.com" || host.endsWith(".pinterest.com") || host === "pin.it") {
    return "pinterest";
  }
  if (
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    host === "l.instagram.com"
  ) {
    return "instagram";
  }
  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host === "m.facebook.com" ||
    host === "l.facebook.com"
  ) {
    return "facebook";
  }
  return "other";
}

export function guestTrafficSourceLabel(source: GuestTrafficSource) {
  switch (source) {
    case "youtube":
      return "YouTube";
    case "google":
      return "Google";
    case "pinterest":
      return "Pinterest";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "direct":
      return "Direct";
    case "other":
      return "Other";
  }
}

function sortViewsAscending(views: GuestPageViewRefererRow[]) {
  return [...views].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return left - right;
  });
}

/**
 * Acquisition summary from ordered page views.
 * First external referrer = earliest non-internal referer string.
 * Source = classification of that referer, or Direct when none / empty.
 */
export function deriveGuestAcquisition(views: GuestPageViewRefererRow[]) {
  const ordered = sortViewsAscending(views);
  const landingPath = ordered[0]?.path || "";
  let firstExternalReferer = "";
  let latestExternalReferer = "";

  for (const view of ordered) {
    const ref = view.referer.trim();
    if (!ref) continue;
    if (isInternalMesaReferer(ref)) continue;
    if (!firstExternalReferer) firstExternalReferer = ref;
    latestExternalReferer = ref;
  }

  const sourceClass = firstExternalReferer
    ? classifyExternalTrafficSource(firstExternalReferer)
    : "direct";
  const source: GuestTrafficSource = sourceClass === "internal" ? "direct" : sourceClass;

  return {
    landingPath,
    firstExternalReferer,
    latestExternalReferer,
    source,
    sourceLabel: guestTrafficSourceLabel(source),
  };
}

export function parseGuestTrafficSource(value: unknown): GuestTrafficSource | "all" {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if ((GUEST_TRAFFIC_SOURCES as readonly string[]).includes(raw)) {
    return raw as GuestTrafficSource;
  }
  return "all";
}
