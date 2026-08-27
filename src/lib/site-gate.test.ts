import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isBlockedApiWhilePrivate } from "./site-gate.ts";

describe("site-gate", () => {
  const original = process.env.SITE_PRIVATE;

  afterEach(() => {
    process.env.SITE_PRIVATE = original;
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
});