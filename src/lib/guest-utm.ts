/**
 * First-touch UTM capture for anonymous guest analytics.
 * Allowlist only: utm_source / utm_medium / utm_campaign.
 */

export const GUEST_UTM_MAX_LENGTH = 100;

export type GuestUtmFields = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

const EMPTY_UTM: GuestUtmFields = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
};

/** Strip control chars; trim; optional lowercase; enforce max length. Empty → null. */
export function sanitizeGuestUtmValue(
  raw: unknown,
  options: { lowercase?: boolean } = {},
): string | null {
  if (raw == null) return null;
  let value = String(raw);
  // Remove C0 controls + DEL (keep printable / common Unicode).
  value = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!value) return null;
  if (options.lowercase) value = value.toLowerCase();
  if (value.length > GUEST_UTM_MAX_LENGTH) {
    value = value.slice(0, GUEST_UTM_MAX_LENGTH).trim();
  }
  return value || null;
}

export function sanitizeGuestUtmFields(input: {
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
}): GuestUtmFields {
  return {
    utmSource: sanitizeGuestUtmValue(input.utmSource, { lowercase: true }),
    utmMedium: sanitizeGuestUtmValue(input.utmMedium, { lowercase: true }),
    utmCampaign: sanitizeGuestUtmValue(input.utmCampaign, { lowercase: false }),
  };
}

export function guestUtmFieldsAreEmpty(utm: GuestUtmFields) {
  return !utm.utmSource && !utm.utmMedium && !utm.utmCampaign;
}

/** Parse only allowlisted keys from a URLSearchParams / query object. */
export function parseGuestUtmFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): GuestUtmFields {
  return sanitizeGuestUtmFields({
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
  });
}

/** Browser helper: read current location.search allowlist only. */
export function parseGuestUtmFromLocationSearch(search: string): GuestUtmFields {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q.trim()) return { ...EMPTY_UTM };
  try {
    return parseGuestUtmFromSearchParams(new URLSearchParams(q));
  } catch {
    return { ...EMPTY_UTM };
  }
}

/** Server body: accept camelCase fields only (never arbitrary query bags). */
export function parseGuestUtmFromRequestBody(body: {
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
}): GuestUtmFields {
  return sanitizeGuestUtmFields(body);
}

/**
 * Map first-touch utm_source into canonical Mesa traffic buckets.
 * Returns null when no usable UTM source (caller falls back to referrer).
 */
export function classifyUtmSource(utmSource: string | null | undefined) {
  const raw = sanitizeGuestUtmValue(utmSource, { lowercase: true });
  if (!raw) return null;

  if (
    raw === "youtube" ||
    raw === "yt" ||
    raw === "youtu.be" ||
    raw.startsWith("youtube_") ||
    raw.includes("youtube")
  ) {
    return "youtube" as const;
  }
  if (raw === "google" || raw.startsWith("google_") || raw.includes("google")) {
    return "google" as const;
  }
  if (
    raw === "pinterest" ||
    raw === "pin" ||
    raw.startsWith("pinterest_") ||
    raw.includes("pinterest")
  ) {
    return "pinterest" as const;
  }
  if (
    raw === "instagram" ||
    raw === "ig" ||
    raw.startsWith("instagram_") ||
    raw.includes("instagram")
  ) {
    return "instagram" as const;
  }
  if (
    raw === "facebook" ||
    raw === "fb" ||
    raw === "meta" ||
    raw.startsWith("facebook_") ||
    raw.includes("facebook")
  ) {
    return "facebook" as const;
  }
  return "other" as const;
}
