import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createSessionToken, ADMIN_COOKIE } from "./admin-session-token.ts";
import {
  isBlockedApiWhilePrivate,
  isStaffPublicPreview,
  shouldGatePublicRequest,
} from "./site-gate.ts";

describe("site-gate", () => {
  const originalPrivate = process.env.SITE_PRIVATE;
  const originalSecret = process.env.ADMIN_SECRET;

  afterEach(() => {
    process.env.SITE_PRIVATE = originalPrivate;
    process.env.ADMIN_SECRET = originalSecret;
  });

  it("allows all APIs when site is public", () => {
    process.env.SITE_PRIVATE = "false";
    assert.equal(isBlockedApiWhilePrivate("/api/recipes/foo/reviews"), false);
  });

  it("blocks recipe APIs when site is private", () => {
    process.env.SITE_PRIVATE = "true";
    assert.equal(isBlockedApiWhilePrivate("/api/recipes/salsa-verde/reviews"), true);
  });

  it("allows guest analytics while private so Coming Soon visits are tracked", () => {
    process.env.SITE_PRIVATE = "true";
    assert.equal(isBlockedApiWhilePrivate("/api/analytics/guest"), false);
  });

  it("keeps admin/auth APIs reachable while private", () => {
    process.env.SITE_PRIVATE = "true";
    assert.equal(isBlockedApiWhilePrivate("/api/auth/signin"), false);
    assert.equal(isBlockedApiWhilePrivate("/api/admin/upload"), false);
    assert.equal(isBlockedApiWhilePrivate("/api/newsletter"), false);
    assert.equal(isBlockedApiWhilePrivate("/api/contact"), false);
  });

  it("staff preview unlocks recipe APIs and skips public gate", () => {
    process.env.SITE_PRIVATE = "true";
    process.env.ADMIN_SECRET = "test-admin-secret-for-gate";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid: "test-sid",
    });
    const cookie = `${ADMIN_COOKIE}=${token}`;
    assert.equal(isStaffPublicPreview(cookie), true);
    assert.equal(shouldGatePublicRequest(cookie), false);
    assert.equal(isBlockedApiWhilePrivate("/api/recipes/bread/reviews", cookie), false);
  });

  it("invalid admin cookie does not unlock private site", () => {
    process.env.SITE_PRIVATE = "true";
    process.env.ADMIN_SECRET = "test-admin-secret-for-gate";
    const cookie = `${ADMIN_COOKIE}=not-a-valid-token`;
    assert.equal(isStaffPublicPreview(cookie), false);
    assert.equal(shouldGatePublicRequest(cookie), true);
    assert.equal(isBlockedApiWhilePrivate("/api/recipes/bread/reviews", cookie), true);
  });
});
