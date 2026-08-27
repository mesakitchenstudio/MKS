import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAdminDate, formatAdminRelativeDateTime } from "./datetime";
import { formatPresenceLabel, formatSignInMethod, isMemberOnline } from "./member-presence";

test("formatAdminDate omits time", () => {
  assert.equal(formatAdminDate("2026-08-24T22:50:00.000Z"), "Aug 24, 2026");
});

test("formatAdminRelativeDateTime uses today/yesterday labels", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(
    formatAdminRelativeDateTime("2026-08-27T07:58:00.000Z", now),
    "Today, 7:58 AM",
  );
  assert.equal(
    formatAdminRelativeDateTime("2026-08-26T16:12:00.000Z", now),
    "Yesterday, 4:12 PM",
  );
  assert.equal(
    formatAdminRelativeDateTime("2026-08-24T21:30:00.000Z", now),
    "Aug 24, 9:30 PM",
  );
});

test("formatSignInMethod labels providers", () => {
  assert.equal(formatSignInMethod("google"), "Google");
  assert.equal(formatSignInMethod("email"), "Email");
  assert.equal(formatSignInMethod(null), "—");
});

test("presence is textually Online or Offline", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");
  assert.equal(isMemberOnline("2026-08-27T11:58:00.000Z", now), true);
  assert.equal(formatPresenceLabel("2026-08-27T11:58:00.000Z", now), "Online");
  assert.equal(formatPresenceLabel("2026-08-27T11:00:00.000Z", now), "Offline");
});
