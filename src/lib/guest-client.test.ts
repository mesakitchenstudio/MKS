import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyGuestClient, isBotUserAgent } from "./guest-client.ts";
import { guestPathTitle, isPopularGuestPath } from "./guest-path-labels.ts";

describe("guest-client", () => {
  it("labels common browsers with OS", () => {
    const chrome = classifyGuestClient(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    assert.equal(chrome.kind, "visitor");
    assert.equal(chrome.label, "Chrome · Windows");
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

  it("does not treat empty UA as a bot", () => {
    assert.equal(classifyGuestClient("").kind, "unknown");
    assert.equal(isBotUserAgent(""), false);
  });
});

describe("guest-path-labels", () => {
  it("maps known routes to friendly titles", () => {
    assert.equal(guestPathTitle("/"), "Home");
    assert.equal(guestPathTitle("/privacy"), "Privacy");
    assert.equal(
      guestPathTitle("/recipes/chocolate-chunk-cookies", new Map([["chocolate-chunk-cookies", "Chocolate Chunk Cookies"]])),
      "Chocolate Chunk Cookies",
    );
  });

  it("excludes internal paths from popular pages", () => {
    assert.equal(isPopularGuestPath("/admin/visitors"), false);
    assert.equal(isPopularGuestPath("/api/analytics/guest"), false);
    assert.equal(isPopularGuestPath("/auth/signin"), false);
    assert.equal(isPopularGuestPath("/recipes"), true);
  });
});
