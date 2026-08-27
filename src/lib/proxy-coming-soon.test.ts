import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy.ts";

describe("proxy while SITE_PRIVATE", () => {
  const original = process.env.SITE_PRIVATE;

  afterEach(() => {
    process.env.SITE_PRIVATE = original;
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
});
