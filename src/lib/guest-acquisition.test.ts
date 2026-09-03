import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyExternalTrafficSource,
  deriveGuestAcquisition,
  isInternalMesaReferer,
  parseGuestTrafficSource,
} from "./guest-acquisition.ts";
import { site } from "../data/site.ts";

describe("guest-acquisition", () => {
  it("treats Mesa self-referrals as internal", () => {
    assert.equal(isInternalMesaReferer(`https://${site.domain}/recipes/foo`), true);
    assert.equal(isInternalMesaReferer(`https://www.${site.domain}/`), true);
    assert.equal(isInternalMesaReferer("https://google.com/"), false);
  });

  it("classifies external hosts into acquisition buckets", () => {
    assert.equal(classifyExternalTrafficSource("https://www.youtube.com/watch?v=x"), "youtube");
    assert.equal(classifyExternalTrafficSource("https://youtu.be/x"), "youtube");
    assert.equal(classifyExternalTrafficSource("https://www.google.com/search?q=mesa"), "google");
    assert.equal(classifyExternalTrafficSource("https://www.pinterest.com/pin/1"), "pinterest");
    assert.equal(classifyExternalTrafficSource("https://l.instagram.com/"), "instagram");
    assert.equal(classifyExternalTrafficSource("https://m.facebook.com/"), "facebook");
    assert.equal(classifyExternalTrafficSource(""), "direct");
    assert.equal(classifyExternalTrafficSource("https://news.ycombinator.com/"), "other");
    assert.equal(
      classifyExternalTrafficSource(`https://${site.domain}/about`),
      "internal",
    );
  });

  it("derives landing and first external referrer from chronological views", () => {
    const acquisition = deriveGuestAcquisition([
      {
        path: "/recipes/a",
        referer: `https://${site.domain}/`,
        createdAt: "2026-01-01T10:00:00.000Z",
      },
      {
        path: "/recipes/b",
        referer: "https://www.youtube.com/watch?v=1",
        createdAt: "2026-01-01T10:01:00.000Z",
      },
      {
        path: "/about",
        referer: "https://www.google.com/",
        createdAt: "2026-01-01T10:02:00.000Z",
      },
    ]);

    assert.equal(acquisition.landingPath, "/recipes/a");
    assert.equal(acquisition.firstExternalReferer, "https://www.youtube.com/watch?v=1");
    assert.equal(acquisition.latestExternalReferer, "https://www.google.com/");
    assert.equal(acquisition.source, "youtube");
    assert.equal(acquisition.sourceLabel, "YouTube");
  });

  it("uses Direct when only internal or empty referrers exist", () => {
    const acquisition = deriveGuestAcquisition([
      {
        path: "/",
        referer: "",
        createdAt: "2026-01-01T10:00:00.000Z",
      },
      {
        path: "/about",
        referer: `https://${site.domain}/`,
        createdAt: "2026-01-01T10:01:00.000Z",
      },
    ]);
    assert.equal(acquisition.source, "direct");
    assert.equal(acquisition.firstExternalReferer, "");
  });

  it("prefers first-touch utm_source over referrer for traffic source", () => {
    const acquisition = deriveGuestAcquisition(
      [
        {
          path: "/coming-soon",
          referer: "https://www.google.com/",
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      {
        utmSource: "youtube",
        utmMedium: "video_description",
        utmCampaign: "flatbread_launch",
      },
    );
    assert.equal(acquisition.source, "youtube");
    assert.equal(acquisition.sourceLabel, "YouTube");
    assert.equal(acquisition.utmMedium, "video_description");
    assert.equal(acquisition.utmCampaign, "flatbread_launch");
    assert.equal(acquisition.sourceFromUtm, true);
  });

  it("orders by createdAt even when input is unsorted", () => {
    const acquisition = deriveGuestAcquisition([
      {
        path: "/later",
        referer: "https://www.google.com/",
        createdAt: "2026-01-01T12:00:00.000Z",
      },
      {
        path: "/landing",
        referer: "https://www.youtube.com/",
        createdAt: "2026-01-01T11:00:00.000Z",
      },
    ]);
    assert.equal(acquisition.landingPath, "/landing");
    assert.equal(acquisition.source, "youtube");
  });

  it("parses traffic source filter values", () => {
    assert.equal(parseGuestTrafficSource("youtube"), "youtube");
    assert.equal(parseGuestTrafficSource("ALL"), "all");
    assert.equal(parseGuestTrafficSource("nope"), "all");
  });
});
