import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  ADMIN_SESSION_LAST_SEEN_THROTTLE_MS,
  adminSessionSubjectKey,
  bindAdminCookieToRegistry,
  createAdminAuthSession,
  formatAdminSessionActivity,
  formatAdminSessionClientLabels,
  isAdminAuthSessionActive,
  legacyAdminSessionTokenId,
  listActiveAdminAuthSessionsForSubject,
  mintAdminSessionTokenId,
  revokeAdminAuthSessionByTokenId,
  revokeAdminAuthSessionsForSubject,
} from "./admin-auth-sessions.ts";
import { createSessionToken, verifySessionToken } from "./admin-session-token.ts";
import { hashPassword } from "./passwords.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("admin auth session helpers", () => {
  it("P/Q: formats unknown UA and missing location quietly", () => {
    const labels = formatAdminSessionClientLabels({ userAgent: "" });
    assert.equal(labels.primary, "Unknown device");
    assert.equal(labels.location, "Location unavailable");

    const chrome = formatAdminSessionClientLabels({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      city: "Istanbul",
      country: "TR",
    });
    assert.match(chrome.primary, /Chrome/);
    assert.match(chrome.primary, /Windows/);
    assert.match(chrome.location, /Istanbul/);
    assert.match(chrome.location, /Türkiye/);
  });

  it("formats recent activity", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    assert.equal(formatAdminSessionActivity(new Date(now.getTime() - 20_000), now), "Active now");
    assert.equal(formatAdminSessionActivity(new Date(now.getTime() - 120_000), now), "2 minutes ago");
  });

  it("legacy bootstrap token id is stable", () => {
    const a = legacyAdminSessionTokenId({ id: "env", exp: 100, sv: 0 });
    const b = legacyAdminSessionTokenId({ id: "env", exp: 100, sv: 0 });
    assert.equal(a, b);
    assert.notEqual(a, legacyAdminSessionTokenId({ id: "env", exp: 101, sv: 0 }));
  });
});

describe("admin auth session registry", () => {
  const db = new PrismaClient();
  const prefix = `adm-sess-${Date.now()}-`;
  let adminId = "";
  const originalSecret = process.env.ADMIN_SECRET;

  before(async () => {
    process.env.ADMIN_SECRET = "test-admin-session-secret";
    await db.$connect();
    const admin = await db.admin.create({
      data: {
        email: `${prefix}editor@example.com`,
        name: "Session Editor",
        passwordHash: hashPassword("password-long-enough"),
        role: "editor",
      },
    });
    adminId = admin.id;
  });

  after(async () => {
    process.env.ADMIN_SECRET = originalSecret;
    await db.adminSession.deleteMany({ where: { subjectKey: { in: [adminId, "env"] } } });
    await db.admin.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("A/B: login create + cookie maps to registry", async () => {
    const row = await createAdminAuthSession({
      adminId,
      headers: {
        ip: "203.0.113.10",
        country: "TR",
        city: "Istanbul",
        region: "34",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        referer: "",
      },
    });
    assert.equal(row.subjectKey, adminId);
    assert.ok(row.sessionTokenId);
    assert.equal(row.revokedAt, null);

    const token = createSessionToken({
      id: adminId,
      email: `${prefix}editor@example.com`,
      name: "Session Editor",
      role: "editor",
      sv: 0,
      sid: row.sessionTokenId,
      exp: row.expiresAt.getTime(),
    });
    const cookie = verifySessionToken(token);
    assert.ok(cookie);
    assert.equal(cookie!.sid, row.sessionTokenId);

    const bound = await bindAdminCookieToRegistry(cookie!);
    assert.ok(bound);
    assert.equal(bound!.sid, row.sessionTokenId);
  });

  it("C/D: current sid match; active list excludes revoked/expired", async () => {
    const current = await createAdminAuthSession({ adminId });
    const other = await createAdminAuthSession({ adminId });
    await revokeAdminAuthSessionByTokenId(other.sessionTokenId, "test");

    const expired = await createAdminAuthSession({
      adminId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    assert.equal(isAdminAuthSessionActive(expired), false);

    const active = await listActiveAdminAuthSessionsForSubject(adminId);
    const ids = active.map((row) => row.sessionTokenId);
    assert.ok(ids.includes(current.sessionTokenId));
    assert.equal(ids.includes(other.sessionTokenId), false);
    assert.equal(ids.includes(expired.sessionTokenId), false);

    const views = active.map((row) => ({
      sessionTokenId: row.sessionTokenId,
      isCurrent: row.sessionTokenId === current.sessionTokenId,
    }));
    assert.equal(views.filter((v) => v.isCurrent).length, 1);
  });

  it("H/L: revoke other; revoke-all-other preserves current", async () => {
    const current = await createAdminAuthSession({ adminId });
    const other = await createAdminAuthSession({ adminId });
    await revokeAdminAuthSessionsForSubject(adminId, "revoked_all_other", current.sessionTokenId);
    const active = await listActiveAdminAuthSessionsForSubject(adminId);
    const ids = active.map((row) => row.sessionTokenId);
    assert.ok(ids.includes(current.sessionTokenId));
    assert.equal(ids.includes(other.sessionTokenId), false);
  });

  it("K/R: revoked and expired cookies fail registry bind", async () => {
    const row = await createAdminAuthSession({ adminId });
    await revokeAdminAuthSessionByTokenId(row.sessionTokenId, "revoked");
    const cookie = {
      id: adminId,
      email: `${prefix}editor@example.com`,
      name: "Session Editor",
      role: "editor" as const,
      sv: 0,
      exp: row.expiresAt.getTime(),
      sid: row.sessionTokenId,
    };
    assert.equal(await bindAdminCookieToRegistry(cookie), null);

    const expiredRow = await createAdminAuthSession({
      adminId,
      expiresAt: new Date(Date.now() - 1000),
    });
    assert.equal(
      await bindAdminCookieToRegistry({
        ...cookie,
        sid: expiredRow.sessionTokenId,
        exp: expiredRow.expiresAt.getTime(),
      }),
      null,
    );
  });

  it("O: lastSeenAt is throttled", async () => {
    const row = await createAdminAuthSession({ adminId });
    const cookie = {
      id: adminId,
      email: `${prefix}editor@example.com`,
      name: "Session Editor",
      role: "editor" as const,
      sv: 0,
      exp: row.expiresAt.getTime(),
      sid: row.sessionTokenId,
    };
    await bindAdminCookieToRegistry(cookie);
    const afterFirst = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    await bindAdminCookieToRegistry(cookie);
    const afterSecond = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(afterFirst.lastSeenAt.getTime(), afterSecond.lastSeenAt.getTime());

    await db.adminSession.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(Date.now() - ADMIN_SESSION_LAST_SEEN_THROTTLE_MS - 1000) },
    });
    await bindAdminCookieToRegistry(cookie);
    const afterThrottle = await db.adminSession.findUniqueOrThrow({ where: { id: row.id } });
    assert.ok(afterThrottle.lastSeenAt.getTime() > afterSecond.lastSeenAt.getTime());
  });

  it("N: subject revoke clears active sessions (staff disable/password)", async () => {
    const a = await createAdminAuthSession({ adminId });
    const b = await createAdminAuthSession({ adminId });
    await revokeAdminAuthSessionsForSubject(adminSessionSubjectKey(adminId), "password_changed");
    const active = await listActiveAdminAuthSessionsForSubject(adminId);
    assert.equal(active.some((row) => row.sessionTokenId === a.sessionTokenId), false);
    assert.equal(active.some((row) => row.sessionTokenId === b.sessionTokenId), false);
  });

  it("legacy bootstrap is idempotent", async () => {
    const exp = Date.now() + 60_000;
    const cookie = {
      id: adminId,
      email: `${prefix}editor@example.com`,
      name: "Session Editor",
      role: "editor" as const,
      sv: 0,
      exp,
    };
    const first = await bindAdminCookieToRegistry(cookie);
    const second = await bindAdminCookieToRegistry(cookie);
    assert.ok(first);
    assert.equal(first!.sid, second!.sid);
    assert.equal(first!.sid, legacyAdminSessionTokenId(cookie));
  });

  it("wiring: UI and auth contracts", () => {
    const token = read("lib/admin-session-token.ts");
    const auth = read("lib/auth.ts");
    const profile = read("app/admin/(app)/profile/page.tsx");
    const staff = read("app/admin/(app)/staff/page.tsx");
    const actions = read("lib/admin-session-actions.ts");
    const controls = read("components/admin/AdminSessionControls.tsx");
    const logout = read("app/admin/logout/route.ts");
    const me = read("app/api/admin/me/route.ts");
    const schema = readFileSync(path.join(root, "..", "..", "prisma", "schema.prisma"), "utf8");

    assert.match(schema, /model AdminSession/);
    assert.match(schema, /sessionTokenId/);
    assert.match(token, /sid\?:/);
    assert.match(auth, /bindAdminCookieToRegistry/);
    assert.match(auth, /createAdminAuthSession/);
    assert.match(auth, /rewriteAdminSessionCookie/);
    assert.match(profile, /Active sessions/);
    assert.match(profile, /revokeOwnAdminSessionAction/);
    assert.match(profile, /AdminRevokeAllOtherButton/);
    assert.match(controls, /Revoke all other sessions/);
    assert.match(staff, /team-sessions/);
    assert.match(staff, /revokeStaffAdminSessionAction/);
    assert.match(actions, /requireAccess\("staff"\)/);
    assert.match(actions, /subjectKey !== adminSessionSubjectKey\(actor\.id\)/);
    assert.match(logout, /revokeAdminAuthSessionByTokenId/);
    assert.match(me, /rewriteAdminSessionCookie/);
    assert.doesNotMatch(actions, /Trusted Device|TRUSTED DEVICE/);
    assert.doesNotMatch(controls, /Trusted Device|TRUSTED DEVICE/);
    assert.ok(mintAdminSessionTokenId().length > 20);
  });
});
