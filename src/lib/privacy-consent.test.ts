import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  acceptAllOptionalConsent,
  createPrivacyConsentRecord,
  isAnalyticsConsentGranted,
  isGoogleSignInEnhancementConsentGranted,
  parsePrivacyConsentValue,
  privacyConsentDecisionsEqual,
  PRIVACY_CONSENT_COOKIE,
  PRIVACY_CONSENT_VERSION,
  readPrivacyConsentFromCookieHeader,
  rejectAllOptionalConsent,
  serializePrivacyConsent,
  UNDECIDED_CONSENT,
} from "./privacy-consent.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("privacy consent model", () => {
  it("parses undecided, accept, reject, and version mismatch without throwing", () => {
    assert.equal(parsePrivacyConsentValue("").status, "undecided");
    assert.equal(parsePrivacyConsentValue(null).status, "undecided");
    assert.equal(parsePrivacyConsentValue(undefined).status, "undecided");
    assert.equal(parsePrivacyConsentValue("{").status, "undecided");
    assert.equal(parsePrivacyConsentValue("not-json").status, "undecided");
    assert.equal(
      parsePrivacyConsentValue(
        JSON.stringify({ version: 99, analytics: true, googleSignInEnhancements: true }),
      ).status,
      "undecided",
    );
    assert.equal(
      parsePrivacyConsentValue(
        JSON.stringify({ version: 1, analytics: "yes", googleSignInEnhancements: true }),
      ).status,
      "undecided",
    );

    const accepted = acceptAllOptionalConsent("2026-09-06T00:00:00.000Z");
    assert.equal(accepted.version, PRIVACY_CONSENT_VERSION);
    assert.equal(accepted.analytics, true);
    assert.equal(accepted.googleSignInEnhancements, true);
    const acceptedDecision = parsePrivacyConsentValue(serializePrivacyConsent(accepted));
    assert.equal(isAnalyticsConsentGranted(acceptedDecision), true);
    assert.equal(isGoogleSignInEnhancementConsentGranted(acceptedDecision), true);

    const rejected = rejectAllOptionalConsent();
    const rejectedDecision = parsePrivacyConsentValue(serializePrivacyConsent(rejected));
    assert.equal(isAnalyticsConsentGranted(rejectedDecision), false);
    assert.equal(isGoogleSignInEnhancementConsentGranted(rejectedDecision), false);

    const mixed = createPrivacyConsentRecord({
      analytics: true,
      googleSignInEnhancements: false,
    });
    const mixedDecision = parsePrivacyConsentValue(serializePrivacyConsent(mixed));
    assert.equal(isAnalyticsConsentGranted(mixedDecision), true);
    assert.equal(isGoogleSignInEnhancementConsentGranted(mixedDecision), false);

    const encoded = encodeURIComponent(serializePrivacyConsent(accepted));
    assert.equal(isAnalyticsConsentGranted(parsePrivacyConsentValue(encoded)), true);
  });

  it("uses a stable UNDECIDED constant (root-cause regression)", () => {
    assert.equal(parsePrivacyConsentValue(""), UNDECIDED_CONSENT);
    assert.equal(parsePrivacyConsentValue("{"), UNDECIDED_CONSENT);
    assert.equal(parsePrivacyConsentValue(""), parsePrivacyConsentValue(null));
    assert.equal(UNDECIDED_CONSENT.status, "undecided");
  });

  it("compares decisions by category values for stable setState", () => {
    const a = parsePrivacyConsentValue(
      serializePrivacyConsent(acceptAllOptionalConsent("2026-01-01T00:00:00.000Z")),
    );
    const b = parsePrivacyConsentValue(
      serializePrivacyConsent(acceptAllOptionalConsent("2026-06-01T00:00:00.000Z")),
    );
    assert.equal(privacyConsentDecisionsEqual(a, b), true);
    const rejected = parsePrivacyConsentValue(
      serializePrivacyConsent(rejectAllOptionalConsent()),
    );
    assert.equal(privacyConsentDecisionsEqual(a, rejected), false);
    assert.equal(
      privacyConsentDecisionsEqual(UNDECIDED_CONSENT, UNDECIDED_CONSENT),
      true,
    );
    const rejectedA = parsePrivacyConsentValue(serializePrivacyConsent(rejectAllOptionalConsent()));
    const rejectedB = parsePrivacyConsentValue(serializePrivacyConsent(rejectAllOptionalConsent()));
    assert.equal(privacyConsentDecisionsEqual(rejectedA, rejectedB), true);
  });

  it("reads consent from Cookie headers including URL-encoded values", () => {
    const record = acceptAllOptionalConsent();
    const header = `${PRIVACY_CONSENT_COOKIE}=${encodeURIComponent(serializePrivacyConsent(record))}; Path=/`;
    const decision = readPrivacyConsentFromCookieHeader(header);
    assert.equal(isAnalyticsConsentGranted(decision), true);
    assert.equal(readPrivacyConsentFromCookieHeader("").status, "undecided");
    assert.equal(readPrivacyConsentFromCookieHeader("foo=bar").status, "undecided");
  });
});

describe("privacy consent wiring", () => {
  it("gates guest analytics, GIS, scripts, and Coming Soon beacon without useSyncExternalStore", () => {
    const layout = read("app/layout.tsx");
    const provider = read("components/PrivacyConsentProvider.tsx");
    const sessionProvider = read("components/AuthSessionProvider.tsx");
    const scripts = read("components/AnalyticsScripts.tsx");
    const bridge = read("components/AnalyticsBridge.tsx");
    const funnel = read("components/FunnelAnalyticsBridge.tsx");
    const beacon = read("components/ComingSoonGuestBeacon.tsx");
    const guestApi = read("app/api/analytics/guest/route.ts");
    const eventsApi = read("app/api/analytics/events/route.ts");
    const consentApi = read("app/api/privacy/consent/route.ts");
    const ui = read("components/PrivacyConsentUi.tsx");
    const footer = read("components/SiteFooter.tsx");
    const privacy = read("app/privacy/page.tsx");
    const googleButton = read("components/auth/GoogleAuthButton.tsx");

    // Root-cause guard: never import or call the sync-external-store hook.
    assert.doesNotMatch(provider, /\buseSyncExternalStore\b/);
    assert.match(provider, /useState/);
    assert.match(provider, /hydrated/);
    assert.match(provider, /UNDECIDED_CONSENT/);
    assert.match(provider, /privacyConsentDecisionsEqual/);
    assert.match(provider, /didHydrateRef/);

    assert.match(layout, /PrivacyConsentProvider/);
    assert.match(layout, /PrivacyConsentUi/);
    assert.match(sessionProvider, /ConsentGatedGuestTracker/);
    assert.match(sessionProvider, /analyticsAllowed/);
    assert.match(sessionProvider, /ConsentGatedGoogleOneTap/);
    assert.match(scripts, /analyticsAllowed/);
    assert.match(bridge, /analyticsAllowed/);
    assert.match(funnel, /analyticsAllowed/);
    assert.match(beacon, /COMING_SOON_CONSENT_GATE_SNIPPET|__mesaAnalyticsOk/);
    assert.match(guestApi, /skipped:\s*"consent"|isAnalyticsConsentGranted/);
    assert.match(eventsApi, /isAnalyticsConsentGranted/);
    assert.match(consentApi, /PRIVACY_CONSENT_COOKIE/);
    assert.match(consentApi, /GUEST_COOKIE/);
    assert.match(ui, /Reject optional/);
    assert.match(ui, /Accept optional/);
    assert.match(ui, /Manage preferences/);
    assert.match(ui, /useSession/);
    assert.match(ui, /displayFirstChoiceBanner/);
    assert.match(ui, /status !== "loading"/);
    assert.match(ui, /choiceButtonClass/);
    assert.match(ui, /manageButtonClass/);
    assert.match(ui, /max-w-5xl/);
    assert.match(ui, /lg:flex-row/);
    // First-choice Accept must not use filled terracotta (equal weight with Reject).
    const bannerSrc = ui.slice(
      ui.indexOf("function PrivacyConsentBanner"),
      ui.indexOf("function PrivacyPreferencesDialog"),
    );
    assert.doesNotMatch(bannerSrc, /bg-terracotta/);
    assert.match(footer, /PrivacyPreferencesFooterLink/);
    assert.match(privacy, /Cookies &amp; preferences/);
    assert.match(privacy, /Advertising is not currently active/);
    assert.match(googleButton, /signIn\("google"/);
    assert.doesNotMatch(ui, /Advertising|AdSense|vendor list/i);
  });
});
