import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGuestClient,
  detectGuestDevice,
  guestDeviceClientLabel,
  guestOsLabel,
  isBotUserAgent,
} from "./guest-client.ts";
import { guestPathTitle, isPopularGuestPath } from "./guest-path-labels.ts";
import { formatApproxLocation, formatCountryCityLocation, formatLatestCountryCityLocation, formatReferrerDisplay } from "./request-meta.ts";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";

const IPHONE_TRUNCATED_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML";

describe("guest-client", () => {
  it("never resolves iPhone UA with like Mac OS X to macOS", () => {
    assert.match(IPHONE_SAFARI_UA, /like Mac OS X/i);
    assert.match(IPHONE_SAFARI_UA, /iPhone/i);

    const device = detectGuestDevice(IPHONE_SAFARI_UA);
    assert.equal(device.device, "iPhone");
    assert.equal(device.os, "iOS");
    assert.notEqual(device.device, "macOS");
    assert.notEqual(device.os, "macOS");
    assert.notEqual(guestOsLabel(IPHONE_SAFARI_UA), "macOS");

    const label = guestDeviceClientLabel(IPHONE_SAFARI_UA);
    assert.equal(label, "iPhone · iOS");
    assert.doesNotMatch(label, /macOS/i);
    assert.equal(classifyGuestClient(IPHONE_SAFARI_UA).label, label);
    assert.equal(isBotUserAgent(IPHONE_SAFARI_UA), false);
  });

  it("keeps truncated iPhone UAs as iPhone, not macOS", () => {
    assert.match(IPHONE_TRUNCATED_UA, /like Mac OS X/i);
    const label = guestDeviceClientLabel(IPHONE_TRUNCATED_UA);
    assert.equal(label, "iPhone · iOS");
    assert.doesNotMatch(label, /macOS/i);
  });

  it("labels representative devices as platform names", () => {
    assert.equal(
      guestDeviceClientLabel(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
      "iPad · iPadOS",
    );
    assert.equal(
      guestDeviceClientLabel(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
      "Android",
    );
    assert.equal(
      guestDeviceClientLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
      "Windows",
    );
    assert.equal(
      guestDeviceClientLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
      "macOS",
    );
  });

  it("classifies named bots conservatively", () => {
    const googleUa = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    const google = classifyGuestClient(googleUa);
    assert.equal(google.kind, "bot");
    assert.equal(google.label, "Googlebot");
    assert.equal(guestDeviceClientLabel(googleUa), "Googlebot");

    const dataUa = "Mozilla/5.0 (compatible; Dataprovider.com)";
    const data = classifyGuestClient(dataUa);
    assert.equal(data.kind, "bot");
    assert.equal(data.label, "Dataprovider bot");
    assert.equal(guestDeviceClientLabel(dataUa), "Dataprovider bot");
  });

  it("does not treat bare Google brand hints as bots", () => {
    const hint = classifyGuestClient('"Google Chrome";v="131", "Chromium";v="131"');
    assert.equal(hint.kind, "visitor");
    assert.equal(hint.label, "Chrome");
    assert.equal(isBotUserAgent(hint.label), false);
    assert.notEqual(hint.label, "Googlebot");
    assert.notEqual(hint.label, "Google");
  });

  it("does not treat empty or unknown UA as a bot", () => {
    assert.equal(classifyGuestClient("").kind, "unknown");
    assert.equal(guestDeviceClientLabel(""), "Unknown");
    assert.equal(isBotUserAgent(""), false);
    assert.equal(classifyGuestClient("some-unknown-client/1.0").kind, "unknown");
  });
});

describe("guest-path-labels", () => {
  it("maps known routes to friendly titles", () => {
    assert.equal(guestPathTitle("/"), "Home");
    assert.equal(guestPathTitle("/coming-soon"), "Coming Soon");
    assert.equal(guestPathTitle("/privacy"), "Privacy");
    assert.equal(guestPathTitle("/auth/error"), "Error");
    assert.equal(
      guestPathTitle(
        "/recipes/chocolate-chunk-cookies",
        new Map([["chocolate-chunk-cookies", "Chocolate Chunk Cookies"]]),
      ),
      "Chocolate Chunk Cookies",
    );
    assert.equal(guestPathTitle("/totally-unmapped-path"), "Totally Unmapped Path");
  });

  it("excludes internal paths from popular pages", () => {
    assert.equal(isPopularGuestPath("/admin/visitors"), false);
    assert.equal(isPopularGuestPath("/api/analytics/guest"), false);
    assert.equal(isPopularGuestPath("/auth/signin"), false);
    assert.equal(isPopularGuestPath("/recipes"), true);
  });
});

describe("request-meta display helpers", () => {
  it("formats approx location without region codes", () => {
    assert.equal(
      formatApproxLocation({ city: "Istanbul", region: "34", country: "TR" }),
      "Istanbul, Türkiye",
    );
    assert.equal(formatApproxLocation({ city: "", region: "34", country: "TR" }), "Türkiye");
    assert.equal(
      formatApproxLocation({ city: "Kartal", region: "Istanbul", country: "TR" }),
      "Kartal, Istanbul, Türkiye",
    );
    assert.equal(formatApproxLocation({ city: "", region: "", country: "", ip: "unknown" }), "");
  });

  it("formats list LOCATION as Country · City", () => {
    assert.equal(
      formatCountryCityLocation({ country: "TR", city: "Istanbul" }),
      "Türkiye · Istanbul",
    );
    assert.equal(formatCountryCityLocation({ country: "TR", city: "" }), "Türkiye");
    assert.equal(formatCountryCityLocation({ country: "", city: "Istanbul" }), "Istanbul");
    assert.equal(formatCountryCityLocation({ country: "", city: "" }), "—");
    assert.equal(formatCountryCityLocation({ country: "US", city: "New York" }), "United States · New York");
    assert.equal(formatCountryCityLocation({ country: "—", city: "Local" }), "—");
  });

  it("picks the newest connection with a usable place for member LOCATION", () => {
    assert.equal(
      formatLatestCountryCityLocation([
        { country: "", city: "" },
        { country: "TR", city: "Istanbul" },
        { country: "DE", city: "Berlin" },
      ]),
      "Türkiye · Istanbul",
    );
    assert.equal(formatLatestCountryCityLocation([{ country: "", city: "" }]), "—");
    assert.equal(formatLatestCountryCityLocation([]), "—");
  });

  it("shows referrer hostname with full URL in title", () => {
    const display = formatReferrerDisplay("https://accounts.google.com/");
    assert.equal(display.label, "accounts.google.com");
    assert.equal(display.title, "https://accounts.google.com/");
  });
});
