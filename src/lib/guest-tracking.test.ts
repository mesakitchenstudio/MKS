import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimGuestPageview,
  clearActiveGuestNavigation,
  guestAnalyticsPath,
  guestNavigationFor,
  isSignedInPublicMember,
  normalizeGuestNavId,
  resetGuestNavigationStateForTests,
  shouldInsertGuestPageView,
  shouldSendGuestPresence,
  shouldSkipGuestAnalytics,
  shouldSkipGuestAnalyticsIngest,
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

test("Coming Soon and public roots stay presence-trackable", () => {
  assert.equal(shouldTrackGuestPath("/"), true);
  assert.equal(shouldTrackGuestPath("/coming-soon"), true);
  assert.equal(guestAnalyticsPath("/", true), "/coming-soon");
  assert.equal(guestAnalyticsPath("/coming-soon", true), "/coming-soon");
});

test("routine heartbeats skip hidden tabs; pageview and unload still send", () => {
  assert.equal(
    shouldSendGuestPresence({ pageview: false, visibilityState: "hidden" }),
    false,
  );
  assert.equal(
    shouldSendGuestPresence({ pageview: false, visibilityState: "visible" }),
    true,
  );
  assert.equal(
    shouldSendGuestPresence({ pageview: true, visibilityState: "hidden" }),
    true,
  );
  assert.equal(
    shouldSendGuestPresence({ pageview: false, visibilityState: "hidden", force: true }),
    true,
  );
});

test("guest presence timings are near-real-time", async () => {
  const {
    GUEST_HEARTBEAT_MS,
    GUEST_PRESENCE_STALE_MS,
    GUEST_PRESENCE_DISCONNECT_GRACE_MS,
    GUEST_ADMIN_PRESENCE_POLL_MS,
    guestPresenceLastSeenForGraceDisconnect,
    isGuestOnlineFromPresence,
    normalizeGuestConnectionKey,
    normalizeGuestVisitorKey,
    resolveGuestVisitorKey,
  } = await import("./guest-tracking.ts");

  assert.equal(GUEST_HEARTBEAT_MS, 12_000);
  assert.equal(GUEST_PRESENCE_STALE_MS, 40_000);
  assert.equal(GUEST_PRESENCE_DISCONNECT_GRACE_MS, 5_000);
  assert.equal(GUEST_ADMIN_PRESENCE_POLL_MS, 3_000);
  assert.equal(normalizeGuestConnectionKey("abc_123"), "abc_123");
  assert.equal(normalizeGuestConnectionKey("bad key"), "");
  assert.equal(normalizeGuestVisitorKey("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000");

  const now = Date.parse("2026-08-28T12:00:00.000Z");
  assert.equal(isGuestOnlineFromPresence({ online: true, lastSeenAt: new Date(0) }, now), true);
  assert.equal(
    isGuestOnlineFromPresence({ lastSeenAt: new Date(now - 30_000) }, now),
    true,
  );
  assert.equal(
    isGuestOnlineFromPresence({ lastSeenAt: new Date(now - GUEST_PRESENCE_STALE_MS - 1) }, now),
    false,
  );

  const graceSeen = guestPresenceLastSeenForGraceDisconnect(now);
  assert.equal(isGuestOnlineFromPresence({ lastSeenAt: graceSeen }, now), true);
  assert.equal(
    isGuestOnlineFromPresence(
      { lastSeenAt: graceSeen },
      now + GUEST_PRESENCE_DISCONNECT_GRACE_MS + 1,
    ),
    false,
  );

  const cookieWins = resolveGuestVisitorKey({
    cookieKey: "cookie-visitor-id",
    clientVisitorKey: "client-visitor-id",
  });
  assert.equal(cookieWins.visitorKey, "cookie-visitor-id");
  assert.equal(cookieWins.source, "cookie");

  const clientBootstrap = resolveGuestVisitorKey({
    cookieKey: "",
    clientVisitorKey: "shared-tab-visitor",
  });
  assert.equal(clientBootstrap.visitorKey, "shared-tab-visitor");
  assert.equal(clientBootstrap.source, "client");

  const generated = resolveGuestVisitorKey({
    cookieKey: "",
    clientVisitorKey: "",
    generate: () => "generated-once",
  });
  assert.equal(generated.visitorKey, "generated-once");
  assert.equal(generated.source, "generated");

  const { shouldRotateMissingGuestVisitor } = await import("./guest-tracking.ts");
  assert.equal(
    shouldRotateMissingGuestVisitor({ source: "cookie", visitorExists: false }),
    true,
  );
  assert.equal(
    shouldRotateMissingGuestVisitor({ source: "cookie", visitorExists: true }),
    false,
  );
  // First-visit bootstrap uses client key with no row yet — must create, not rotate.
  assert.equal(
    shouldRotateMissingGuestVisitor({ source: "client", visitorExists: false }),
    false,
  );
  assert.equal(
    shouldRotateMissingGuestVisitor({ source: "generated", visitorExists: false }),
    false,
  );
});

test("auth conversion must end anonymous presence without waiting for stale TTL", () => {
  // Documented contract: successful Member auth clears GuestPresenceSession rows
  // immediately via endAllPresence (see /api/analytics/guest), not via heartbeat expiry.
  assert.equal(shouldSkipGuestAnalytics({ email: "member@example.com" }), true);
  assert.equal(isSignedInPublicMember({ email: "member@example.com" }), true);
  assert.equal(shouldSkipGuestAnalytics({ email: null }), false);
  assert.equal(isSignedInPublicMember({ email: null }), false);
});

test("Phase 2A: anonymous tracked; members and staff skipped", () => {
  // 1. Anonymous visitor is tracked
  assert.equal(shouldSkipGuestAnalytics(null), false);
  assert.equal(shouldSkipGuestAnalytics({ email: "" }), false);
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: null,
      staffRole: null,
      hasVerifiedAdminSession: false,
    }),
    false,
  );

  // 2. Public Member is skipped
  assert.equal(shouldSkipGuestAnalytics({ email: "member@example.com" }), true);
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: "member@example.com",
      staffRole: null,
      hasVerifiedAdminSession: false,
    }),
    true,
  );
  assert.equal(isSignedInPublicMember({ email: "member@example.com" }), true);

  // 3–5. Owner / Audience / Editor with NextAuth staffRole are skipped
  for (const role of ["owner", "members", "editor"] as const) {
    assert.equal(
      shouldSkipGuestAnalytics({ email: `${role}@example.com`, staffRole: role }),
      true,
      role,
    );
    assert.equal(
      shouldSkipGuestAnalyticsIngest({
        email: `${role}@example.com`,
        staffRole: role,
        hasVerifiedAdminSession: false,
      }),
      true,
      role,
    );
    assert.equal(
      isSignedInPublicMember({ email: `${role}@example.com`, staffRole: role }),
      false,
      role,
    );
  }

  // 6. Valid admin-session cookie without NextAuth staffRole is skipped
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: null,
      staffRole: null,
      hasVerifiedAdminSession: true,
    }),
    true,
  );

  // 7. Invalid/forged admin-session does NOT skip anonymous visitors
  // (hasVerifiedAdminSession must be false when getAdminSession() returns null)
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: null,
      staffRole: null,
      hasVerifiedAdminSession: false,
    }),
    false,
  );

  // 8. Coming Soon anonymous visitor is tracked (path remains trackable; ingest not skipped)
  assert.equal(shouldTrackGuestPath("/coming-soon"), true);
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: null,
      staffRole: null,
      hasVerifiedAdminSession: false,
    }),
    false,
  );

  // 9. Coming Soon staff preview is skipped (admin session and/or staffRole)
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: null,
      staffRole: null,
      hasVerifiedAdminSession: true,
    }),
    true,
  );
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: "owner@example.com",
      staffRole: "owner",
      hasVerifiedAdminSession: false,
    }),
    true,
  );

  // 10–11. Funnel events use the same ingest helper (anonymous record / staff skip)
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: null,
      staffRole: undefined,
      hasVerifiedAdminSession: false,
    }),
    false,
  );
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: "owner@example.com",
      staffRole: "owner",
      hasVerifiedAdminSession: false,
    }),
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

  // 12. Guest presence from staff is not refreshed/created — same ingest skip gate
  // (upsertGuestActivity is never called when shouldSkipGuestAnalyticsIngest is true)
  assert.equal(
    shouldSkipGuestAnalyticsIngest({
      email: "editor@example.com",
      staffRole: "editor",
      hasVerifiedAdminSession: false,
    }),
    true,
  );
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
