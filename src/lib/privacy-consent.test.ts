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
  PRIVACY_CONSENT_COOKIE,
  PRIVACY_CONSENT_VERSION,
  readPrivacyConsentFromCookieHeader,
  rejectAllOptionalConsent,
  serializePrivacyConsent,
} from "./privacy-consent.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("privacy consent model", () => {
  it("parses undecided, accept, reject, and version mismatch", () => {
    assert.equal(parsePrivacyConsentValue("").status, "undecided");
    assert.equal(parsePrivacyConsentValue("{").status, "undecided");
    assert.equal(
      parsePrivacyConsentValue(
        JSON.stringify({ version: 99, analytics: true, googleSignInEnhancements: true }),
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
  });

  it("reads consent from Cookie headers", () => {
    const record = acceptAllOptionalConsent();
    const header = `${PRIVACY_CONSENT_COOKIE}=${encodeURIComponent(serializePrivacyConsent(record))}; Path=/`;
    const decision = readPrivacyConsentFromCookieHeader(header);
    assert.equal(isAnalyticsConsentGranted(decision), true);
  });
});

describe("privacy consent wiring", () => {
  it("gates guest analytics, GIS, scripts, and Coming Soon beacon", () => {
    const layout = read("app/layout.tsx");
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
    const ads = read("lib/ads.ts");
    const googleButton = read("components/auth/GoogleAuthButton.tsx");

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
    assert.match(ui, /Optional analytics/);
    assert.match(ui, /Google sign-in enhancements/);
    assert.match(footer, /PrivacyPreferencesFooterLink/);
    assert.match(privacy, /Cookies &amp; preferences/);
    assert.match(privacy, /Privacy preferences/);
    assert.match(privacy, /Advertising is not currently active/);
    assert.match(ads, /ADS_ENABLED === "true"/);
    assert.match(googleButton, /signIn\("google"/);
    assert.doesNotMatch(ui, /Advertising|AdSense|vendor list/i);
  });
});
