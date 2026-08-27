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
import { formatApproxLocation, formatReferrerDisplay } from "./request-meta.ts";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";

describe("guest-client", () => {
  it("labels common browsers with OS", () => {
    const chrome = classifyGuestClient(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    assert.equal(chrome.kind, "visitor");
    assert.equal(chrome.label, "Chrome · Windows");
  });

  it("does not classify iPhone UA as macOS despite like Mac OS X", () => {
    const device = detectGuestDevice(IPHONE_SAFARI_UA);
    assert.equal(device.device, "iPhone");
    assert.equal(device.os, "iOS");
    assert.equal(guestOsLabel(IPHONE_SAFARI_UA), "iOS");
    assert.notEqual(guestOsLabel(IPHONE_SAFARI_UA), "macOS");

    const client = classifyGuestClient(IPHONE_SAFARI_UA);
    assert.equal(client.kind, "visitor");
    assert.equal(client.label, "iPhone · Safari");
    assert.equal(guestDeviceClientLabel(IPHONE_SAFARI_UA), "iPhone · Safari");
    assert.equal(isBotUserAgent(IPHONE_SAFARI_UA), false);
  });

  it("labels iPad and Android distinctly from desktop Mac", () => {
    const ipad = classifyGuestClient(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    assert.equal(ipad.label, "iPad · Safari");

    const android = classifyGuestClient(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    assert.equal(android.label, "Android · Chrome");

    const mac = classifyGuestClient(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    assert.equal(mac.label, "Safari · macOS");
  });

  it("classifies named bots conservatively", () => {
    const google = classifyGuestClient(
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    );
    assert.equal(google.kind, "bot");
    assert.equal(google.label, "Googlebot");
    assert.equal(isBotUserAgent(google.label), true);

    const data = classifyGuestClient("Mozilla/5.0 (compatible; Dataprovider.com)");
    assert.equal(data.kind, "bot");
    assert.equal(data.label, "Dataprovider bot");
  });

  it("does not treat bare Google brand hints as bots", () => {
    const hint = classifyGuestClient('"Google Chrome";v="131", "Chromium";v="131"');
    assert.equal(hint.kind, "visitor");
    assert.equal(hint.label, "Chrome");
    assert.equal(isBotUserAgent(hint.label), false);
  });

  it("does not treat empty UA as a bot", () => {
    assert.equal(classifyGuestClient("").kind, "unknown");
    assert.equal(isBotUserAgent(""), false);
  });
});

describe("guest-path-labels", () => {
  it("maps known routes to friendly titles", () => {
    assert.equal(guestPathTitle("/"), "Home");
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
  });

  it("shows referrer hostname with full URL in title", () => {
    const display = formatReferrerDisplay("https://accounts.google.com/");
    assert.equal(display.label, "accounts.google.com");
    assert.equal(display.title, "https://accounts.google.com/");
  });
});
