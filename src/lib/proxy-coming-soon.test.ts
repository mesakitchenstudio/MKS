import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { ADMIN_COOKIE, createSessionToken } from "./admin-session-token.ts";
import { proxy } from "../proxy.ts";

describe("proxy while SITE_PRIVATE", () => {
  const originalPrivate = process.env.SITE_PRIVATE;
  const originalSecret = process.env.ADMIN_SECRET;

  afterEach(() => {
    process.env.SITE_PRIVATE = originalPrivate;
    process.env.ADMIN_SECRET = originalSecret;
  });

  it("does not rewrite guest analytics to Coming Soon", async () => {
    process.env.SITE_PRIVATE = "true";
    const req = new NextRequest(new URL("http://localhost:3000/api/analytics/guest"), {
      method: "POST",
    });
    const res = proxy(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });

  it("still rewrites public pages to Coming Soon", () => {
    process.env.SITE_PRIVATE = "true";
    const req = new NextRequest(new URL("http://localhost:3000/"));
    const res = proxy(req);
    assert.equal(res.headers.get("x-middleware-rewrite"), "http://localhost:3000/coming-soon");
  });

  it("still 404s recipe APIs while private", () => {
    process.env.SITE_PRIVATE = "true";
    const req = new NextRequest(
      new URL("http://localhost:3000/api/recipes/salsa-verde/reviews"),
    );
    const res = proxy(req);
    assert.equal(res.status, 404);
  });

  it("lets staff with admin cookie browse public pages and recipe APIs", () => {
    process.env.SITE_PRIVATE = "true";
    process.env.ADMIN_SECRET = "test-admin-secret-for-proxy";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid: "test-sid",
    });
    const cookie = `${ADMIN_COOKIE}=${token}`;

    const page = new NextRequest(new URL("http://localhost:3000/recipes/bread"), {
      headers: { cookie },
    });
    const pageRes = proxy(page);
    assert.equal(pageRes.headers.get("x-middleware-rewrite"), null);
    assert.equal(pageRes.headers.get("x-middleware-next"), "1");

    const api = new NextRequest(
      new URL("http://localhost:3000/api/recipes/bread/reviews"),
      { headers: { cookie } },
    );
    const apiRes = proxy(api);
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.headers.get("x-middleware-next"), "1");
  });

  it("lets staff browse recipe deep links used from Admin Reviews", () => {
    process.env.SITE_PRIVATE = "true";
    process.env.ADMIN_SECRET = "test-admin-secret-for-proxy";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid: "test-sid",
    });
    const page = new NextRequest(
      new URL(
        "http://localhost:3000/recipes/iced-horchata-coffee?review=rev_1#review-rev_1",
      ),
      { headers: { cookie: `${ADMIN_COOKIE}=${token}` } },
    );
    const pageRes = proxy(page);
    assert.equal(pageRes.headers.get("x-middleware-rewrite"), null);
    assert.equal(pageRes.headers.get("x-middleware-next"), "1");
  });
});
