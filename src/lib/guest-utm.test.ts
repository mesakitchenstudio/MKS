import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUEST_UTM_MAX_LENGTH,
  classifyUtmSource,
  guestUtmFieldsAreEmpty,
  parseGuestUtmFromLocationSearch,
  parseGuestUtmFromRequestBody,
  parseGuestUtmFromSearchParams,
  sanitizeGuestUtmFields,
  sanitizeGuestUtmValue,
} from "./guest-utm.ts";
import { deriveGuestAcquisition } from "./guest-acquisition.ts";
import { shouldSkipGuestAnalytics, shouldSkipGuestAnalyticsIngest } from "./guest-tracking.ts";

describe("guest-utm sanitization", () => {
  it("trims, lowercases source/medium, preserves campaign casing", () => {
    const fields = sanitizeGuestUtmFields({
      utmSource: "  YouTube ",
      utmMedium: " Video_Description ",
      utmCampaign: " Flatbread_Launch ",
    });
    assert.equal(fields.utmSource, "youtube");
    assert.equal(fields.utmMedium, "video_description");
    assert.equal(fields.utmCampaign, "Flatbread_Launch");
  });

  it("rejects empty values as null", () => {
    assert.equal(sanitizeGuestUtmValue("   "), null);
    assert.equal(sanitizeGuestUtmValue(""), null);
    assert.equal(sanitizeGuestUtmValue(null), null);
    assert.deepEqual(
      sanitizeGuestUtmFields({ utmSource: " ", utmMedium: "", utmCampaign: null }),
      { utmSource: null, utmMedium: null, utmCampaign: null },
    );
  });

  it("strips control characters and truncates oversized values", () => {
    assert.equal(sanitizeGuestUtmValue("you\u0000tube", { lowercase: true }), "youtube");
    const huge = "x".repeat(GUEST_UTM_MAX_LENGTH + 40);
    const cleaned = sanitizeGuestUtmValue(huge);
    assert.equal(cleaned?.length, GUEST_UTM_MAX_LENGTH);
  });

  it("parses only allowlisted keys from search params", () => {
    const params = new URLSearchParams(
      "utm_source=Pinterest&utm_medium=social&utm_campaign=pins&utm_content=secret&foo=bar",
    );
    const utm = parseGuestUtmFromSearchParams(params);
    assert.equal(utm.utmSource, "pinterest");
    assert.equal(utm.utmMedium, "social");
    assert.equal(utm.utmCampaign, "pins");
    assert.equal("utm_content" in utm, false);

    const fromLocation = parseGuestUtmFromLocationSearch(
      "?utm_source=google&utm_medium=cpc&evil=<script>",
    );
    assert.equal(fromLocation.utmSource, "google");
    assert.equal(fromLocation.utmMedium, "cpc");
  });

  it("server body parser accepts only allowlisted camelCase fields", () => {
    const utm = parseGuestUtmFromRequestBody({
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "launch",
    });
    assert.equal(utm.utmSource, "newsletter");
    assert.equal(utm.utmMedium, "email");
    assert.equal(utm.utmCampaign, "launch");
  });
});

describe("guest-utm source classification + precedence", () => {
  it("maps common utm_source values into canonical buckets", () => {
    assert.equal(classifyUtmSource("youtube"), "youtube");
    assert.equal(classifyUtmSource("pinterest"), "pinterest");
    assert.equal(classifyUtmSource("google"), "google");
    assert.equal(classifyUtmSource("instagram"), "instagram");
    assert.equal(classifyUtmSource("facebook"), "facebook");
    assert.equal(classifyUtmSource("newsletter"), "other");
    assert.equal(classifyUtmSource(null), null);
  });

  it("prefers first-touch UTM over referrer; falls back when UTM absent", () => {
    const views = [
      {
        path: "/coming-soon",
        referer: "https://www.youtube.com/watch?v=1",
        createdAt: "2026-01-01T10:00:00.000Z",
      },
    ];
    const withUtm = deriveGuestAcquisition(views, {
      utmSource: "pinterest",
      utmMedium: "social",
      utmCampaign: "pins",
    });
    assert.equal(withUtm.source, "pinterest");
    assert.equal(withUtm.sourceFromUtm, true);
    assert.equal(withUtm.utmCampaign, "pins");
    assert.equal(withUtm.firstExternalReferer, "https://www.youtube.com/watch?v=1");

    const referrerOnly = deriveGuestAcquisition(views);
    assert.equal(referrerOnly.source, "youtube");
    assert.equal(referrerOnly.sourceFromUtm, false);

    const direct = deriveGuestAcquisition([
      { path: "/", referer: "", createdAt: "2026-01-01T10:00:00.000Z" },
    ]);
    assert.equal(direct.source, "direct");
  });

  it("does not invent empty campaign/medium rows when UTM absent", () => {
    const acquisition = deriveGuestAcquisition([
      {
        path: "/recipes/a",
        referer: "https://www.google.com/",
        createdAt: "2026-01-01T10:00:00.000Z",
      },
    ]);
    assert.equal(acquisition.utmSource, null);
    assert.equal(acquisition.utmMedium, null);
    assert.equal(acquisition.utmCampaign, null);
  });
});

describe("guest-utm Phase 2A interaction", () => {
  it("staff and members still skip ingest (UTMs would not be written)", () => {
    assert.equal(shouldSkipGuestAnalytics({ email: "m@x.com" }), true);
    assert.equal(
      shouldSkipGuestAnalytics({ email: "o@x.com", staffRole: "owner" }),
      true,
    );
    assert.equal(
      shouldSkipGuestAnalyticsIngest({
        email: null,
        staffRole: null,
        hasVerifiedAdminSession: true,
      }),
      true,
    );
    assert.equal(guestUtmFieldsAreEmpty({ utmSource: null, utmMedium: null, utmCampaign: null }), true);
    assert.equal(
      guestUtmFieldsAreEmpty({
        utmSource: "youtube",
        utmMedium: null,
        utmCampaign: null,
      }),
      false,
    );
  });
});
