import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccess,
  canDeleteGuestVisitors,
  canViewGuestNetworkDiagnostics,
} from "./admin-access.ts";
import { formatApproxLocation } from "./request-meta.ts";
import {
  classifyGuestClient,
  formatGuestOsBrowserLabel,
  guestBrowserLabel,
  guestOsLabel,
} from "./guest-client.ts";

/**
 * Phase 2B permission + Audience-safe detail projection contracts.
 * Route/API handlers call these helpers; this locks the matrix without HTTP fixtures.
 */
describe("Phase 2B visitor permissions", () => {
  it("grants Visitors overview/detail area to Owner and Audience; denies Editor", () => {
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canAccess("members", "members"), true);
    assert.equal(canAccess("editor", "members"), false);
  });

  it("gates IP diagnostics API to Owner only", () => {
    assert.equal(canViewGuestNetworkDiagnostics("owner"), true);
    assert.equal(canViewGuestNetworkDiagnostics("members"), false);
    assert.equal(canViewGuestNetworkDiagnostics("editor"), false);
    // Unauthenticated / unknown role — same denial as Audience
    assert.equal(canViewGuestNetworkDiagnostics(""), false);
  });

  it("gates single and bulk delete to Owner only", () => {
    assert.equal(canDeleteGuestVisitors("owner"), true);
    assert.equal(canDeleteGuestVisitors("members"), false);
    assert.equal(canDeleteGuestVisitors("editor"), false);
  });

  it("Audience detail may show approx location and parsed device without raw IP/UA", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const guest = {
      ip: "203.0.113.10",
      userAgent: ua,
      country: "TR",
      city: "Istanbul",
      region: "34",
    };

    // Server may read raw UA to derive labels…
    const device = formatGuestOsBrowserLabel(guest.userAgent);
    const os = guestOsLabel(guest.userAgent);
    const browser = guestBrowserLabel(guest.userAgent);
    const kind = classifyGuestClient(guest.userAgent);
    const approx = formatApproxLocation(guest);

    assert.equal(device, "Windows · Chrome 131");
    assert.equal(os, "Windows");
    assert.match(browser, /Chrome/i);
    assert.equal(kind.kind, "visitor");
    assert.match(approx, /Istanbul/);

    // …but Audience response props must not include raw network fields.
    const audienceProps = {
      shortKey: "abcd1234",
      kindLabel: "Human",
      device,
      os,
      browser,
      approxLocation: approx,
      // Owner-only fields omitted when !canViewGuestNetworkDiagnostics
      ...(canViewGuestNetworkDiagnostics("members")
        ? { ips: [guest.ip], userAgent: guest.userAgent, visitorKey: "full-uuid" }
        : {}),
    };

    assert.equal("ips" in audienceProps, false);
    assert.equal("userAgent" in audienceProps, false);
    assert.equal("visitorKey" in audienceProps, false);
    assert.equal("ip" in audienceProps, false);
    assert.ok(audienceProps.approxLocation);
    assert.ok(audienceProps.device);

    const ownerProps = {
      ...audienceProps,
      ...(canViewGuestNetworkDiagnostics("owner")
        ? { ips: [guest.ip], userAgent: guest.userAgent, visitorKey: "full-uuid" }
        : {}),
    };
    assert.deepEqual(ownerProps.ips, ["203.0.113.10"]);
    assert.equal(ownerProps.userAgent, ua);
  });

  it("Audience UI capabilities exclude select/delete and network panel", () => {
    const audience = {
      canOpenVisitors: canAccess("members", "members"),
      canNetwork: canViewGuestNetworkDiagnostics("members"),
      canDelete: canDeleteGuestVisitors("members"),
    };
    assert.equal(audience.canOpenVisitors, true);
    assert.equal(audience.canNetwork, false);
    assert.equal(audience.canDelete, false);

    const owner = {
      canOpenVisitors: canAccess("owner", "members"),
      canNetwork: canViewGuestNetworkDiagnostics("owner"),
      canDelete: canDeleteGuestVisitors("owner"),
    };
    assert.equal(owner.canOpenVisitors, true);
    assert.equal(owner.canNetwork, true);
    assert.equal(owner.canDelete, true);
  });
});
