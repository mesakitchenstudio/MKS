import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ADMIN_COOKIE, createSessionToken } from "./admin-session-token.ts";
import { ADMIN_SESSION_TTL_MS } from "./admin-auth-sessions.ts";
import { proxy } from "../proxy.ts";

describe("proxy while SITE_PRIVATE", () => {
  const originalPrivate = process.env.SITE_PRIVATE;
  const originalSecret = process.env.ADMIN_SECRET;
  const db = new PrismaClient();
  const sid = `proxy-live-${Date.now()}`;

  before(async () => {
    process.env.ADMIN_SECRET = "test-admin-secret-for-proxy";
    await db.$connect();
    await db.adminSession.create({
      data: {
        adminId: null,
        sessionTokenId: sid,
        subjectKey: "env",
        expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
        userAgent: "test",
      },
    });
  });

  after(async () => {
    await db.adminSession.deleteMany({ where: { sessionTokenId: { startsWith: "proxy-live-" } } });
    await db.$disconnect();
    process.env.SITE_PRIVATE = originalPrivate;
    process.env.ADMIN_SECRET = originalSecret;
  });

  afterEach(() => {
    process.env.SITE_PRIVATE = originalPrivate;
    process.env.ADMIN_SECRET = "test-admin-secret-for-proxy";
  });

  it("does not rewrite guest analytics to Coming Soon", async () => {
    process.env.SITE_PRIVATE = "true";
    const req = new NextRequest(new URL("http://localhost:3000/api/analytics/guest"), {
      method: "POST",
    });
    const res = await proxy(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });

  it("still rewrites public pages to Coming Soon", async () => {
    process.env.SITE_PRIVATE = "true";
    const req = new NextRequest(new URL("http://localhost:3000/"));
    const res = await proxy(req);
    assert.equal(res.headers.get("x-middleware-rewrite"), "http://localhost:3000/coming-soon");
  });

  it("still 404s recipe APIs while private", async () => {
    process.env.SITE_PRIVATE = "true";
    const req = new NextRequest(
      new URL("http://localhost:3000/api/recipes/salsa-verde/reviews"),
    );
    const res = await proxy(req);
    assert.equal(res.status, 404);
  });

  it("lets live staff browse public pages and recipe APIs", async () => {
    process.env.SITE_PRIVATE = "true";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid,
    });
    const cookie = `${ADMIN_COOKIE}=${token}`;

    const page = new NextRequest(new URL("http://localhost:3000/recipes/bread"), {
      headers: { cookie },
    });
    const pageRes = await proxy(page);
    assert.equal(pageRes.headers.get("x-middleware-rewrite"), null);
    assert.equal(pageRes.headers.get("x-middleware-next"), "1");

    const api = new NextRequest(
      new URL("http://localhost:3000/api/recipes/bread/reviews"),
      { headers: { cookie } },
    );
    const apiRes = await proxy(api);
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.headers.get("x-middleware-next"), "1");
  });

  it("revoked crypto cookie does not unlock private site and is cleared", async () => {
    process.env.SITE_PRIVATE = "true";
    const revokedSid = `proxy-revoked-${Date.now()}`;
    await db.adminSession.create({
      data: {
        adminId: null,
        sessionTokenId: revokedSid,
        subjectKey: "env",
        expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
        revokedAt: new Date(),
        revokedReason: "test",
      },
    });
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid: revokedSid,
    });
    const page = new NextRequest(new URL("http://localhost:3000/recipes/bread"), {
      headers: { cookie: `${ADMIN_COOKIE}=${token}` },
    });
    const pageRes = await proxy(page);
    assert.equal(pageRes.headers.get("x-middleware-rewrite"), "http://localhost:3000/coming-soon");
    const cleared = pageRes.cookies.get(ADMIN_COOKIE);
    assert.ok(cleared);
    assert.equal(cleared?.value, "");
  });

  it("lets staff browse recipe deep links used from Admin Reviews", async () => {
    process.env.SITE_PRIVATE = "true";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid,
    });
    const page = new NextRequest(
      new URL(
        "http://localhost:3000/recipes/iced-horchata-coffee?review=rev_1#review-rev_1",
      ),
      { headers: { cookie: `${ADMIN_COOKIE}=${token}` } },
    );
    const pageRes = await proxy(page);
    assert.equal(pageRes.headers.get("x-middleware-rewrite"), null);
    assert.equal(pageRes.headers.get("x-middleware-next"), "1");
  });
});
