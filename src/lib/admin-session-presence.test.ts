import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  ADMIN_SESSION_ACTIVE_NOW_MS,
  ADMIN_SESSION_LAST_SEEN_THROTTLE_MS,
  ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS,
  createAdminAuthSession,
  formatAdminSessionActivity,
  touchAdminSessionPresence,
  revokeAdminAuthSessionByTokenId,
} from "./admin-auth-sessions.ts";
import {
  ADMIN_PRESENCE_HEARTBEAT_MS,
  ADMIN_STAFF_SESSIONS_POLL_MS,
  shouldPollAdminStaffSessions,
  shouldRunAdminPresenceHeartbeat,
} from "./admin-session-presence.ts";
import { loadOwnerAdminSessionGroups } from "./admin-session-ui.ts";
import { hashPassword } from "./passwords.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("admin session presence timing", () => {
  it("exposes the approved heartbeat / active / poll constants", () => {
    assert.equal(ADMIN_PRESENCE_HEARTBEAT_MS, 20_000);
    assert.equal(ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS, 18_000);
    assert.equal(ADMIN_SESSION_ACTIVE_NOW_MS, 60_000);
    assert.equal(ADMIN_STAFF_SESSIONS_POLL_MS, 10_000);
    assert.equal(ADMIN_SESSION_LAST_SEEN_THROTTLE_MS, 5 * 60 * 1000);
  });

  it("Active now uses the shared 60s threshold", () => {
    const now = new Date("2026-09-12T12:00:00.000Z");
    assert.equal(
      formatAdminSessionActivity(new Date(now.getTime() - 20_000), now),
      "Active now",
    );
    assert.equal(
      formatAdminSessionActivity(new Date(now.getTime() - 59_999), now),
      "Active now",
    );
    assert.equal(
      formatAdminSessionActivity(new Date(now.getTime() - 60_000), now),
      "1 minute ago",
    );
    assert.equal(
      formatAdminSessionActivity(new Date(now.getTime() - 120_000), now),
      "2 minutes ago",
    );
    assert.equal(
      formatAdminSessionActivity(new Date(now.getTime() - 5 * 60_000), now),
      "5 minutes ago",
    );
  });

  it("pauses heartbeat and Sessions poll while document is hidden", () => {
    assert.equal(shouldRunAdminPresenceHeartbeat("visible"), true);
    assert.equal(shouldRunAdminPresenceHeartbeat("hidden"), false);
    assert.equal(shouldPollAdminStaffSessions("visible"), true);
    assert.equal(shouldPollAdminStaffSessions("hidden"), false);
  });
});

describe("admin session presence touch", () => {
  const db = new PrismaClient();
  const prefix = `adm-pres-${Date.now()}-`;
  let adminId = "";

  before(async () => {
    await db.$connect();
    const admin = await db.admin.create({
      data: {
        email: `${prefix}owner@example.com`,
        name: "Presence Owner",
        passwordHash: hashPassword("password-long-enough"),
        role: "owner",
      },
    });
    adminId = admin.id;
  });

  after(async () => {
    await db.adminSession.deleteMany({ where: { subjectKey: adminId } });
    await db.admin.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("touches only the caller's session lastSeenAt", async () => {
    const a = await createAdminAuthSession({ adminId });
    const b = await createAdminAuthSession({ adminId });
    const earlier = new Date(Date.now() - ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS - 1_000);
    await db.adminSession.update({
      where: { id: a.id },
      data: { lastSeenAt: earlier },
    });
    await db.adminSession.update({
      where: { id: b.id },
      data: { lastSeenAt: earlier },
    });

    const result = await touchAdminSessionPresence(a.sessionTokenId);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.updated, true);
    assert.equal(result.locationUpdated, false);

    const aRow = await db.adminSession.findUniqueOrThrow({ where: { id: a.id } });
    const bRow = await db.adminSession.findUniqueOrThrow({ where: { id: b.id } });
    assert.ok(aRow.lastSeenAt.getTime() > earlier.getTime());
    assert.equal(bRow.lastSeenAt.getTime(), earlier.getTime());
  });

  it("throttles rapid presence writes then updates after the window", async () => {
    const row = await createAdminAuthSession({ adminId });
    const first = await touchAdminSessionPresence(row.sessionTokenId);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    // Just created → lastSeenAt is now; second call within throttle should not write.
    const second = await touchAdminSessionPresence(row.sessionTokenId);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.updated, false);
    assert.equal(second.locationUpdated, false);
    assert.equal(second.lastSeenAt.getTime(), first.lastSeenAt.getTime());

    await db.adminSession.update({
      where: { id: row.id },
      data: {
        lastSeenAt: new Date(Date.now() - ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS - 500),
      },
    });
    const third = await touchAdminSessionPresence(row.sessionTokenId);
    assert.equal(third.ok, true);
    if (!third.ok) return;
    assert.equal(third.updated, true);
    assert.equal(third.locationUpdated, false);
    assert.ok(third.lastSeenAt.getTime() > second.lastSeenAt.getTime());
  });

  it("same IP heartbeat leaves location fields unchanged", async () => {
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0 Chrome/120 Windows",
        referer: "",
      },
    });
    await db.adminSession.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(Date.now() - ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS - 500) },
    });

    const result = await touchAdminSessionPresence(row.sessionTokenId, {
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0 Chrome/120 Windows",
        referer: "",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.updated, true);
    assert.equal(result.locationUpdated, false);

    const after = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.ipAddress, "203.0.113.10");
    assert.equal(after.city, "Istanbul");
    assert.equal(after.country, "TR");
    assert.equal(after.region, "34");
    assert.equal(after.browser, row.browser);
  });

  it("changed IP refreshes location fields together", async () => {
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0 Chrome/120 Windows",
        referer: "",
      },
    });
    await db.adminSession.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(Date.now() - ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS - 500) },
    });

    const result = await touchAdminSessionPresence(row.sessionTokenId, {
      headers: {
        ip: "198.51.100.44",
        country: "IR",
        region: "07",
        city: "Tehran",
        userAgent: "Mozilla/5.0 Chrome/120 Windows",
        referer: "",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.updated, true);
    assert.equal(result.locationUpdated, true);

    const after = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.ipAddress, "198.51.100.44");
    assert.equal(after.country, "IR");
    assert.equal(after.region, "07");
    assert.equal(after.city, "Tehran");
    // Device metadata stays from session creation.
    assert.equal(after.userAgent, row.userAgent);
    assert.equal(after.browser, row.browser);
  });

  it("changed IP inside presence throttle still updates location promptly", async () => {
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    // Fresh lastSeenAt → still inside throttle for presence-only writes.
    const result = await touchAdminSessionPresence(row.sessionTokenId, {
      headers: {
        ip: "198.51.100.55",
        country: "IR",
        region: "",
        city: "Isfahan",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.updated, true);
    assert.equal(result.locationUpdated, true);

    const after = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.ipAddress, "198.51.100.55");
    assert.equal(after.city, "Isfahan");
    assert.equal(after.country, "IR");
    assert.equal(after.region, "");
  });

  it("same IP inside throttle skips unnecessary DB write", async () => {
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    const before = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    const result = await touchAdminSessionPresence(row.sessionTokenId, {
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.updated, false);
    assert.equal(result.locationUpdated, false);
    assert.equal(result.lastSeenAt.getTime(), before.lastSeenAt.getTime());

    const after = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.city, "Istanbul");
    assert.equal(after.lastSeenAt.getTime(), before.lastSeenAt.getTime());
  });

  it("missing city/region geo headers normalize without crashing", async () => {
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    const result = await touchAdminSessionPresence(row.sessionTokenId, {
      headers: {
        ip: "198.51.100.77",
        country: "IR",
        region: "",
        city: "",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.locationUpdated, true);

    const after = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.ipAddress, "198.51.100.77");
    assert.equal(after.country, "IR");
    assert.equal(after.city, "");
    assert.equal(after.region, "");
  });

  it("rejects revoked and expired sessions and cannot refresh their location", async () => {
    const revoked = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    await revokeAdminAuthSessionByTokenId(revoked.sessionTokenId, "test_revoke");
    const revokedResult = await touchAdminSessionPresence(revoked.sessionTokenId, {
      headers: {
        ip: "198.51.100.1",
        country: "IR",
        region: "",
        city: "Tehran",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    assert.deepEqual(revokedResult, { ok: false, reason: "revoked" });
    const revokedRow = await db.adminSession.findUniqueOrThrow({ where: { id: revoked.id } });
    assert.equal(revokedRow.city, "Istanbul");

    const expired = await createAdminAuthSession({
      adminId,
      expiresAt: new Date(Date.now() - 1_000),
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    const expiredResult = await touchAdminSessionPresence(expired.sessionTokenId, {
      headers: {
        ip: "198.51.100.1",
        country: "IR",
        region: "",
        city: "Tehran",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    assert.deepEqual(expiredResult, { ok: false, reason: "expired" });
    const expiredRow = await db.adminSession.findUniqueOrThrow({ where: { id: expired.id } });
    assert.equal(expiredRow.city, "Istanbul");

    assert.deepEqual(await touchAdminSessionPresence("missing-token"), {
      ok: false,
      reason: "missing",
    });
  });

  it("heartbeat for one sid cannot update another session's location", async () => {
    const a = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "",
        city: "Istanbul",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });
    const b = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "198.51.100.20",
        country: "IR",
        region: "",
        city: "Tehran",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });

    await touchAdminSessionPresence(a.sessionTokenId, {
      headers: {
        ip: "203.0.113.99",
        country: "DE",
        region: "",
        city: "Berlin",
        userAgent: "Mozilla/5.0",
        referer: "",
      },
    });

    const aRow = await db.adminSession.findUniqueOrThrow({ where: { id: a.id } });
    const bRow = await db.adminSession.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(aRow.city, "Berlin");
    assert.equal(aRow.ipAddress, "203.0.113.99");
    assert.equal(bRow.city, "Tehran");
    assert.equal(bRow.ipAddress, "198.51.100.20");
  });

  it("two logins produce distinct rows with sid-specific current detection", async () => {
    const a = await createAdminAuthSession({ adminId });
    const b = await createAdminAuthSession({ adminId });
    assert.notEqual(a.sessionTokenId, b.sessionTokenId);

    const asA = await loadOwnerAdminSessionGroups({ id: adminId, sid: a.sessionTokenId });
    const group = asA.find((g) => g.subjectKey === adminId);
    assert.ok(group);
    const rowA = group!.sessions.find((s) => s.sessionTokenId === a.sessionTokenId);
    const rowB = group!.sessions.find((s) => s.sessionTokenId === b.sessionTokenId);
    assert.equal(rowA?.isCurrent, true);
    assert.equal(rowB?.isCurrent, false);

    const asB = await loadOwnerAdminSessionGroups({ id: adminId, sid: b.sessionTokenId });
    const groupB = asB.find((g) => g.subjectKey === adminId);
    assert.equal(
      groupB!.sessions.find((s) => s.sessionTokenId === b.sessionTokenId)?.isCurrent,
      true,
    );
    assert.equal(
      groupB!.sessions.find((s) => s.sessionTokenId === a.sessionTokenId)?.isCurrent,
      false,
    );
  });

  it("Sessions list refresh discovers a newly created second session", async () => {
    await db.adminSession.updateMany({
      where: { subjectKey: adminId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "test_cleanup" },
    });
    const first = await createAdminAuthSession({ adminId });
    const before = await loadOwnerAdminSessionGroups({ id: adminId, sid: first.sessionTokenId });
    const beforeGroup = before.find((g) => g.subjectKey === adminId);
    assert.equal(beforeGroup?.sessions.length, 1);

    const second = await createAdminAuthSession({ adminId });
    const after = await loadOwnerAdminSessionGroups({ id: adminId, sid: first.sessionTokenId });
    const afterGroup = after.find((g) => g.subjectKey === adminId);
    assert.equal(afterGroup?.sessions.length, 2);
    assert.ok(afterGroup!.sessions.some((s) => s.sessionTokenId === second.sessionTokenId));
  });

  it("revoked session disappears from the owner list and cannot heartbeat", async () => {
    const keep = await createAdminAuthSession({ adminId });
    const drop = await createAdminAuthSession({ adminId });
    await revokeAdminAuthSessionByTokenId(drop.sessionTokenId, "revoked_by_owner");

    const groups = await loadOwnerAdminSessionGroups({ id: adminId, sid: keep.sessionTokenId });
    const group = groups.find((g) => g.subjectKey === adminId);
    assert.ok(group);
    assert.ok(group!.sessions.every((s) => s.sessionTokenId !== drop.sessionTokenId));
    assert.deepEqual(await touchAdminSessionPresence(drop.sessionTokenId), {
      ok: false,
      reason: "revoked",
    });
  });

  it("owner Sessions view reflects refreshed location after heartbeat", async () => {
    await db.adminSession.updateMany({
      where: { subjectKey: adminId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "test_cleanup" },
    });
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        region: "34",
        city: "Istanbul",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0",
        referer: "",
      },
    });
    const before = await loadOwnerAdminSessionGroups({ id: adminId, sid: row.sessionTokenId });
    const beforeSession = before
      .find((g) => g.subjectKey === adminId)
      ?.sessions.find((s) => s.sessionTokenId === row.sessionTokenId);
    assert.match(beforeSession?.location || "", /Istanbul/);

    await touchAdminSessionPresence(row.sessionTokenId, {
      headers: {
        ip: "198.51.100.44",
        country: "IR",
        region: "07",
        city: "Tehran",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0",
        referer: "",
      },
    });

    const after = await loadOwnerAdminSessionGroups({ id: adminId, sid: row.sessionTokenId });
    const afterSession = after
      .find((g) => g.subjectKey === adminId)
      ?.sessions.find((s) => s.sessionTokenId === row.sessionTokenId);
    assert.match(afterSession?.location || "", /Tehran/);
    assert.doesNotMatch(afterSession?.location || "", /Istanbul/);
    assert.equal(afterSession?.isCurrent, true);
  });
});

describe("admin session presence wiring", () => {
  it("AdminShell heartbeats presence; staff Sessions poll live; presence is separate from /me", () => {
    const shell = read("components/admin/AdminShell.tsx");
    const panel = read("components/admin/AdminTeamSessionsPanel.tsx");
    const staff = read("app/admin/(app)/staff/page.tsx");
    const presenceRoute = read("app/api/admin/presence/route.ts");
    const sessionsRoute = read("app/api/admin/staff/sessions/route.ts");
    const me = read("app/api/admin/me/route.ts");
    const authSessions = read("lib/admin-auth-sessions.ts");

    assert.match(shell, /\/api\/admin\/presence/);
    assert.match(shell, /ADMIN_PRESENCE_HEARTBEAT_MS/);
    assert.match(shell, /shouldRunAdminPresenceHeartbeat/);
    assert.match(shell, /visibilitychange/);
    assert.match(shell, /clearInterval/);

    assert.match(panel, /\/api\/admin\/staff\/sessions/);
    assert.match(panel, /ADMIN_STAFF_SESSIONS_POLL_MS/);
    assert.match(panel, /shouldPollAdminStaffSessions/);
    assert.match(panel, /visibilitychange/);
    assert.match(panel, /Keep the currently rendered list/);
    assert.match(panel, /clearInterval/);

    assert.match(staff, /AdminTeamSessionsPanel/);
    assert.match(presenceRoute, /touchAdminSessionPresence/);
    assert.match(presenceRoute, /headers:\s*request\.headers/);
    assert.match(presenceRoute, /locationUpdated/);
    assert.match(presenceRoute, /force-dynamic/);
    assert.doesNotMatch(presenceRoute, /createAdminAuthSession|writeAdminSession/);
    assert.match(sessionsRoute, /canAccess\(admin\.role, "staff"\)/);
    assert.match(sessionsRoute, /loadOwnerAdminSessionGroups/);
    assert.match(sessionsRoute, /force-dynamic/);
    assert.doesNotMatch(me, /touchAdminSessionPresence/);
    assert.match(authSessions, /ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS/);
    assert.match(authSessions, /ADMIN_SESSION_LAST_SEEN_THROTTLE_MS/);
    assert.match(authSessions, /locationUpdated/);
    assert.match(authSessions, /normalizeAdminSessionIp/);
    assert.notEqual(ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS, ADMIN_SESSION_LAST_SEEN_THROTTLE_MS);
  });
});
