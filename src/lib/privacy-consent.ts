/**
 * Lightweight first-party privacy consent (optional analytics + Google One Tap).
 * Not a CMP — no ad/vendor lists. Essential auth always works.
 */

export const PRIVACY_CONSENT_COOKIE = "mks_consent";
export const PRIVACY_CONSENT_VERSION = 1;
/** ~400 days — aligned with guest cookie lifespan. */
export const PRIVACY_CONSENT_MAX_AGE = 60 * 60 * 24 * 400;

export type PrivacyConsentRecord = {
  version: number;
  analytics: boolean;
  googleSignInEnhancements: boolean;
  updatedAt: string;
};

export type PrivacyConsentDecision =
  | { status: "undecided" }
  | { status: "decided"; record: PrivacyConsentRecord };

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

/** Top-level Accept optional — both optional categories on. */
export function acceptAllOptionalConsent(updatedAt?: string): PrivacyConsentRecord {
  return createPrivacyConsentRecord({
    analytics: true,
    googleSignInEnhancements: true,
    updatedAt,
  });
}

/** Top-level Reject optional — both optional categories off. */
export function rejectAllOptionalConsent(updatedAt?: string): PrivacyConsentRecord {
  return createPrivacyConsentRecord({
    analytics: false,
    googleSignInEnhancements: false,
    updatedAt,
  });
}

export function parsePrivacyConsentValue(raw: string | null | undefined): PrivacyConsentDecision {
  if (!raw?.trim()) return { status: "undecided" };
  try {
    const parsed = JSON.parse(raw) as Partial<PrivacyConsentRecord>;
    if (parsed.version !== PRIVACY_CONSENT_VERSION) return { status: "undecided" };
    if (typeof parsed.analytics !== "boolean") return { status: "undecided" };
    if (typeof parsed.googleSignInEnhancements !== "boolean") return { status: "undecided" };
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
  } catch {
    return { status: "undecided" };
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
  if (!cookieHeader) return { status: "undecided" };
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
  return { status: "undecided" };
}

export function isAnalyticsConsentGranted(decision: PrivacyConsentDecision): boolean {
  return decision.status === "decided" && decision.record.analytics;
}

export function isGoogleSignInEnhancementConsentGranted(
  decision: PrivacyConsentDecision,
): boolean {
  return decision.status === "decided" && decision.record.googleSignInEnhancements;
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
  if (typeof document === "undefined") return { status: "undecided" };
  return readPrivacyConsentFromCookieHeader(document.cookie);
}

/**
 * Compact check for classic scripts (Coming Soon beacon) — no module imports.
 * Keep in sync with parsePrivacyConsentValue / PRIVACY_CONSENT_VERSION.
 */
export const COMING_SOON_CONSENT_GATE_SNIPPET = `function __mesaAnalyticsOk(){try{var m=document.cookie.match(/(?:^|; )mks_consent=([^;]*)/);if(!m)return!1;var c=JSON.parse(decodeURIComponent(m[1]));return!(!c||c.version!==1||c.analytics!==!0)}catch(e){return!1}}`;
