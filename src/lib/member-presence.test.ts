import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPresenceLabel,
  isMemberOnline,
  isMemberOnlineFromPresence,
  MEMBER_ONLINE_WITHIN_MS,
  normalizePresenceSessionKey,
} from "./member-presence.ts";

describe("member-presence (shared Online rule for Visitors + Members)", () => {
  it("marks lastSeen within 3 minutes as Online for Windows and Android alike", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const fresh = new Date(now - 45_000);
    const stale = new Date(now - MEMBER_ONLINE_WITHIN_MS - 1);

    assert.equal(isMemberOnline(fresh, now), true);
    assert.equal(formatPresenceLabel(fresh, now), "Online");
    assert.equal(isMemberOnline(stale, now), false);
    assert.equal(formatPresenceLabel(stale, now), "Offline");
  });

  it("treats a refreshed lastSeen (heartbeat) as Online again", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const afterHeartbeat = new Date(now - 10_000);
    assert.equal(isMemberOnline(afterHeartbeat, now), true);
    assert.equal(MEMBER_ONLINE_WITHIN_MS, 3 * 60 * 1000);
  });

  it("prefers explicit online flag over stale lastSeenAt", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const stale = new Date(now - MEMBER_ONLINE_WITHIN_MS - 1);
    assert.equal(isMemberOnlineFromPresence({ online: true, lastSeenAt: stale }, now), true);
    assert.equal(isMemberOnlineFromPresence({ online: false, lastSeenAt: new Date(now) }, now), false);
  });

  it("normalizes presence session keys", () => {
    assert.equal(normalizePresenceSessionKey("abc_123-XYZ"), "abc_123-XYZ");
    assert.equal(normalizePresenceSessionKey("bad key"), "");
    assert.equal(normalizePresenceSessionKey(""), "");
  });
});
