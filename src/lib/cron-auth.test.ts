import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { authorizeCronRequest } from "./cron-auth.ts";

describe("cron Bearer auth", () => {
  const env = { CRON_SECRET: "test-cron-secret" };

  it("valid Bearer secret succeeds", () => {
    const request = new Request("https://example.com/api/cron/example", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    assert.deepEqual(authorizeCronRequest(request, env), { ok: true });
  });

  it("missing authorization fails", () => {
    const request = new Request("https://example.com/api/cron/example");
    assert.deepEqual(authorizeCronRequest(request, env), {
      ok: false,
      status: 401,
      error: "Unauthorized.",
    });
  });

  it("invalid Bearer secret fails", () => {
    const request = new Request("https://example.com/api/cron/example", {
      headers: { authorization: "Bearer wrong" },
    });
    assert.deepEqual(authorizeCronRequest(request, env), {
      ok: false,
      status: 401,
      error: "Unauthorized.",
    });
  });

  it("?secret=correct-secret alone does NOT authenticate", () => {
    const request = new Request(
      "https://example.com/api/cron/example?secret=test-cron-secret",
    );
    assert.deepEqual(authorizeCronRequest(request, env), {
      ok: false,
      status: 401,
      error: "Unauthorized.",
    });
  });

  it("missing server CRON_SECRET returns 503 without exposing a secret", () => {
    const request = new Request("https://example.com/api/cron/example", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const result = authorizeCronRequest(request, { CRON_SECRET: "" });
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    });
    assert.doesNotMatch(JSON.stringify(result), /test-cron-secret/);
  });

  it("youtube-sync and guest-retention routes use Bearer-only shared helper", () => {
    const youtube = readFileSync(
      new URL("../app/api/cron/youtube-sync/route.ts", import.meta.url),
      "utf8",
    );
    const retention = readFileSync(
      new URL("../app/api/cron/guest-retention/route.ts", import.meta.url),
      "utf8",
    );
    for (const route of [youtube, retention]) {
      assert.match(route, /authorizeCronRequest/);
      assert.doesNotMatch(route, /searchParams\.get\("secret"\)/);
      assert.doesNotMatch(route, /querySecret/);
    }
  });
});
