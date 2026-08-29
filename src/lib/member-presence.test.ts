import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPresenceLabel,
  isMemberOnline,
  isMemberOnlineFromPresence,
  isMemberPresenceSessionLive,
  MEMBER_ONLINE_WITHIN_MS,
  MEMBER_PRESENCE_DISCONNECT_GRACE_MS,
  MEMBER_PRESENCE_HEARTBEAT_MS,
  MEMBER_PRESENCE_STALE_MS,
  normalizePresenceSessionKey,
  presenceLastSeenForGraceDisconnect,
} from "./member-presence.ts";

describe("member-presence (shared Online rule for Visitors + Members)", () => {
  it("keeps the longer Visitors online window at 3 minutes", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const fresh = new Date(now - 45_000);
    const stale = new Date(now - MEMBER_ONLINE_WITHIN_MS - 1);

    assert.equal(isMemberOnline(fresh, now), true);
    assert.equal(formatPresenceLabel(fresh, now), "Online");
    assert.equal(isMemberOnline(stale, now), false);
    assert.equal(formatPresenceLabel(stale, now), "Offline");
    assert.equal(MEMBER_ONLINE_WITHIN_MS, 3 * 60 * 1000);
  });

  it("uses a near-real-time stale window for member presence sessions", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    assert.equal(MEMBER_PRESENCE_HEARTBEAT_MS, 12_000);
    assert.equal(MEMBER_PRESENCE_STALE_MS, 40_000);
    assert.equal(MEMBER_PRESENCE_DISCONNECT_GRACE_MS, 5_000);

    assert.equal(isMemberPresenceSessionLive(new Date(now - 30_000), now), true);
    assert.equal(isMemberPresenceSessionLive(new Date(now - MEMBER_PRESENCE_STALE_MS - 1), now), false);
  });

  it("grace disconnect keeps a session Online briefly then expires", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const graceSeen = presenceLastSeenForGraceDisconnect(now);
    assert.equal(isMemberPresenceSessionLive(graceSeen, now), true);
    assert.equal(
      isMemberPresenceSessionLive(graceSeen, now + MEMBER_PRESENCE_DISCONNECT_GRACE_MS + 1),
      false,
    );
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
