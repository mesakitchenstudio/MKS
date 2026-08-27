import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimGuestPageview,
  clearActiveGuestNavigation,
  guestAnalyticsPath,
  guestNavigationFor,
  normalizeGuestNavId,
  resetGuestNavigationStateForTests,
  shouldInsertGuestPageView,
  shouldTrackGuestPath,
} from "./guest-tracking";

test("shouldTrackGuestPath excludes admin, auth, and member surfaces", () => {
  assert.equal(shouldTrackGuestPath("/"), true);
  assert.equal(shouldTrackGuestPath("/coming-soon"), true);
  assert.equal(shouldTrackGuestPath("/recipes/salsa-verde"), true);
  assert.equal(shouldTrackGuestPath("/admin/visitors"), false);
  assert.equal(shouldTrackGuestPath("/api/analytics/guest"), false);
  assert.equal(shouldTrackGuestPath("/auth/signin"), false);
  assert.equal(shouldTrackGuestPath("/profile"), false);
});

test("guestAnalyticsPath canonicalizes Coming Soon while site is private", () => {
  assert.equal(guestAnalyticsPath("/", true), "/coming-soon");
  assert.equal(guestAnalyticsPath("/recipes/salsa-verde", true), "/coming-soon");
  assert.equal(guestAnalyticsPath("/coming-soon", true), "/coming-soon");
  assert.equal(guestAnalyticsPath("/", false), "/");
  assert.equal(guestAnalyticsPath("/coming-soon", false), "/coming-soon");
  assert.equal(guestAnalyticsPath("/admin", true), "");
});

test("normalizeGuestNavId accepts uuid-like tokens only", () => {
  assert.equal(normalizeGuestNavId("482e5343-9791-4027-a185-c95811bdcda8"), "482e5343-9791-4027-a185-c95811bdcda8");
  assert.equal(normalizeGuestNavId(" bad id "), "");
  assert.equal(normalizeGuestNavId(""), "");
});

test("heartbeats never insert page views", () => {
  assert.equal(
    shouldInsertGuestPageView({
      recordPageView: false,
      navId: "nav-1",
      alreadyStoredForNavId: false,
      latestPath: "/about",
      path: "/about",
      latestAgeMs: 0,
      dedupeWindowMs: 5_000,
    }),
    false,
  );
});

test("navId makes inserts idempotent per navigation", () => {
  assert.equal(
    shouldInsertGuestPageView({
      recordPageView: true,
      navId: "nav-1",
      alreadyStoredForNavId: false,
      latestPath: "/about",
      path: "/about",
      latestAgeMs: 0,
      dedupeWindowMs: 5_000,
    }),
    true,
  );
  assert.equal(
    shouldInsertGuestPageView({
      recordPageView: true,
      navId: "nav-1",
      alreadyStoredForNavId: true,
      latestPath: "/about",
      path: "/about",
      latestAgeMs: 0,
      dedupeWindowMs: 5_000,
    }),
    false,
  );
});

test("legacy same-path window suppresses only near-duplicate inserts", () => {
  assert.equal(
    shouldInsertGuestPageView({
      recordPageView: true,
      navId: "",
      alreadyStoredForNavId: false,
      latestPath: "/about",
      path: "/about",
      latestAgeMs: 1_000,
      dedupeWindowMs: 5_000,
    }),
    false,
  );
  assert.equal(
    shouldInsertGuestPageView({
      recordPageView: true,
      navId: "",
      alreadyStoredForNavId: false,
      latestPath: "/about",
      path: "/about",
      latestAgeMs: 10_000,
      dedupeWindowMs: 5_000,
    }),
    true,
  );
  assert.equal(
    shouldInsertGuestPageView({
      recordPageView: true,
      navId: "",
      alreadyStoredForNavId: false,
      latestPath: "/recipes",
      path: "/about",
      latestAgeMs: 100,
      dedupeWindowMs: 5_000,
    }),
    true,
  );
});

test("guest navigation claim is stable across remount simulation", () => {
  resetGuestNavigationStateForTests();
  const first = guestNavigationFor("/about");
  const second = guestNavigationFor("/about");
  assert.equal(first.navId, second.navId);
  assert.equal(claimGuestPageview(first.navId), true);
  assert.equal(claimGuestPageview(second.navId), false);

  clearActiveGuestNavigation();
  const later = guestNavigationFor("/about");
  assert.notEqual(later.navId, first.navId);
  assert.equal(claimGuestPageview(later.navId), true);
});
