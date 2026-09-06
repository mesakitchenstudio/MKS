/**
 * Lightweight first-party privacy consent (optional analytics + Google One Tap).
 * Not a CMP - no ad/vendor lists. Essential auth always works.
 */

export const PRIVACY_CONSENT_COOKIE = "mks_consent";
export const PRIVACY_CONSENT_VERSION = 1;
/** ~400 days - aligned with guest cookie lifespan. */
export const PRIVACY_CONSENT_MAX_AGE = 60 * 60 * 24 * 400;
/**
 * Document CSS variable set while the first-choice studio note is visible.
 * Value = measured card height + breathing room (px).
 * Applied locally (e.g. Coming Soon Meanwhile margin, public footer padding) —
 * never as overflow-inducing padding on a viewport-locked column.
 */
export const PRIVACY_CONSENT_SAFE_AREA_CSS_VAR = "--mks-privacy-consent-safe";

export type PrivacyConsentRecord = {
  version: number;
  analytics: boolean;
  googleSignInEnhancements: boolean;
  updatedAt: string;
};

export type PrivacyConsentDecision =
  | { status: "undecided" }
  | { status: "decided"; record: PrivacyConsentRecord };

/** Stable undecided sentinel - never allocate a fresh object for this case. */
export const UNDECIDED_CONSENT: PrivacyConsentDecision = Object.freeze({
  status: "undecided",
});

export function createPrivacyConsentRecord(input: {
  analytics: boolean;
  googleSignInEnhancements: boolean;
  updatedAt?: string;
}): PrivacyConsentRecord {
  return {
    version: PRIVACY_CONSENT_VERSION,
    analytics: Boolean(input.analytics),
    googleSignInEnhancements: Boolean(input.googleSignInEnhancements),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

/** Top-level Accept optional - both optional categories on. */
export function acceptAllOptionalConsent(updatedAt?: string): PrivacyConsentRecord {
  return createPrivacyConsentRecord({
    analytics: true,
    googleSignInEnhancements: true,
    updatedAt,
  });
}

/** Top-level Reject optional - both optional categories off. */
export function rejectAllOptionalConsent(updatedAt?: string): PrivacyConsentRecord {
  return createPrivacyConsentRecord({
    analytics: false,
    googleSignInEnhancements: false,
    updatedAt,
  });
}

/**
 * Pure cookie/value parser. Never throws into React rendering.
 * Missing / empty / malformed / invalid schema / unsupported version → UNDECIDED.
 */
function normalizePrivacyConsentRecord(
  parsed: Partial<PrivacyConsentRecord>,
): PrivacyConsentDecision {
  if (parsed.version !== PRIVACY_CONSENT_VERSION) return UNDECIDED_CONSENT;
  if (typeof parsed.analytics !== "boolean") return UNDECIDED_CONSENT;
  if (typeof parsed.googleSignInEnhancements !== "boolean") return UNDECIDED_CONSENT;
  return {
    status: "decided",
    record: {
      version: PRIVACY_CONSENT_VERSION,
      analytics: parsed.analytics,
      googleSignInEnhancements: parsed.googleSignInEnhancements,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    },
  };
}

export function parsePrivacyConsentValue(raw: string | null | undefined): PrivacyConsentDecision {
  if (!raw?.trim()) return UNDECIDED_CONSENT;
  try {
    return normalizePrivacyConsentRecord(JSON.parse(raw) as Partial<PrivacyConsentRecord>);
  } catch {
    try {
      // Cookie jars / document.cookie may still be percent-encoded.
      return normalizePrivacyConsentRecord(
        JSON.parse(decodeURIComponent(raw)) as Partial<PrivacyConsentRecord>,
      );
    } catch {
      return UNDECIDED_CONSENT;
    }
  }
}

export function serializePrivacyConsent(record: PrivacyConsentRecord): string {
  return JSON.stringify({
    version: PRIVACY_CONSENT_VERSION,
    analytics: Boolean(record.analytics),
    googleSignInEnhancements: Boolean(record.googleSignInEnhancements),
    updatedAt: record.updatedAt || new Date().toISOString(),
  });
}

export function readPrivacyConsentFromCookieHeader(
  cookieHeader: string | null | undefined,
): PrivacyConsentDecision {
  if (!cookieHeader) return UNDECIDED_CONSENT;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== PRIVACY_CONSENT_COOKIE) continue;
    const value = trimmed.slice(eq + 1);
    try {
      return parsePrivacyConsentValue(decodeURIComponent(value));
    } catch {
      return parsePrivacyConsentValue(value);
    }
  }
  return UNDECIDED_CONSENT;
}

export function isAnalyticsConsentGranted(decision: PrivacyConsentDecision): boolean {
  return decision.status === "decided" && decision.record.analytics;
}

export function isGoogleSignInEnhancementConsentGranted(
  decision: PrivacyConsentDecision,
): boolean {
  return decision.status === "decided" && decision.record.googleSignInEnhancements;
}

/** Compare category values (ignore updatedAt) for stable setState decisions. */
export function privacyConsentDecisionsEqual(
  left: PrivacyConsentDecision,
  right: PrivacyConsentDecision,
): boolean {
  if (left.status !== right.status) return false;
  if (left.status === "undecided" || right.status === "undecided") return true;
  return (
    left.record.analytics === right.record.analytics &&
    left.record.googleSignInEnhancements === right.record.googleSignInEnhancements &&
    left.record.version === right.record.version
  );
}

export function privacyConsentCookieOptions(production = process.env.NODE_ENV === "production") {
  return {
    httpOnly: false as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: PRIVACY_CONSENT_MAX_AGE,
    secure: production,
  };
}

/** Client-readable cookie write (non-HttpOnly). */
export function writePrivacyConsentCookieClient(record: PrivacyConsentRecord) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(serializePrivacyConsent(record));
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PRIVACY_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${PRIVACY_CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
}

export function readPrivacyConsentFromDocumentCookie(): PrivacyConsentDecision {
  if (typeof document === "undefined") return UNDECIDED_CONSENT;
  return readPrivacyConsentFromCookieHeader(document.cookie);
}

/**
 * Compact check for classic scripts (Coming Soon beacon) - no module imports.
 * Keep in sync with parsePrivacyConsentValue / PRIVACY_CONSENT_VERSION.
 */
export const COMING_SOON_CONSENT_GATE_SNIPPET = `function __mesaAnalyticsOk(){try{var m=document.cookie.match(/(?:^|; )mks_consent=([^;]*)/);if(!m)return!1;var c=JSON.parse(decodeURIComponent(m[1]));return!(!c||c.version!==1||c.analytics!==!0)}catch(e){return!1}}`;
