import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  authorizeCronRequest,
  authorizeRecipePublishCronRequest,
} from "./cron-auth.ts";

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

describe("recipe-publish cron auth", () => {
  const dedicated = "recipe-publish-test-secret";
  const shared = "shared-cron-test-secret";

  it("rejects missing authorization", () => {
    const result = authorizeRecipePublishCronRequest(
      new Request("https://example.com/api/cron/recipe-publish"),
      { RECIPE_PUBLISH_CRON_SECRET: dedicated, CRON_SECRET: shared },
    );
    assert.deepEqual(result, { ok: false, status: 401, error: "Unauthorized." });
  });

  it("rejects wrong secret", () => {
    const result = authorizeRecipePublishCronRequest(
      new Request("https://example.com/api/cron/recipe-publish", {
        headers: { authorization: "Bearer wrong" },
      }),
      { RECIPE_PUBLISH_CRON_SECRET: dedicated, CRON_SECRET: shared },
    );
    assert.deepEqual(result, { ok: false, status: 401, error: "Unauthorized." });
  });

  it("accepts RECIPE_PUBLISH_CRON_SECRET", () => {
    const result = authorizeRecipePublishCronRequest(
      new Request("https://example.com/api/cron/recipe-publish", {
        headers: { authorization: `Bearer ${dedicated}` },
      }),
      { RECIPE_PUBLISH_CRON_SECRET: dedicated, CRON_SECRET: shared },
    );
    assert.deepEqual(result, { ok: true });
  });

  it("accepts CRON_SECRET for backward compatibility", () => {
    const result = authorizeRecipePublishCronRequest(
      new Request("https://example.com/api/cron/recipe-publish", {
        headers: { authorization: `Bearer ${shared}` },
      }),
      { RECIPE_PUBLISH_CRON_SECRET: dedicated, CRON_SECRET: shared },
    );
    assert.deepEqual(result, { ok: true });
  });

  it("rejects query-string secrets", () => {
    const result = authorizeRecipePublishCronRequest(
      new Request(
        `https://example.com/api/cron/recipe-publish?secret=${dedicated}`,
      ),
      { RECIPE_PUBLISH_CRON_SECRET: dedicated },
    );
    assert.deepEqual(result, { ok: false, status: 401, error: "Unauthorized." });
  });

  it("returns 503 when neither secret is configured", () => {
    const result = authorizeRecipePublishCronRequest(
      new Request("https://example.com/api/cron/recipe-publish", {
        headers: { authorization: `Bearer ${dedicated}` },
      }),
      { RECIPE_PUBLISH_CRON_SECRET: "", CRON_SECRET: "" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.match(result.error, /RECIPE_PUBLISH_CRON_SECRET/);
    }
    assert.doesNotMatch(JSON.stringify(result), new RegExp(dedicated));
  });

  it("dedicated secret cannot authorize shared cron routes", () => {
    const sharedOnly = authorizeCronRequest(
      new Request("https://example.com/api/cron/youtube-sync", {
        headers: { authorization: `Bearer ${dedicated}` },
      }),
      { CRON_SECRET: shared, RECIPE_PUBLISH_CRON_SECRET: dedicated },
    );
    assert.deepEqual(sharedOnly, {
      ok: false,
      status: 401,
      error: "Unauthorized.",
    });
  });

  it("recipe-publish route uses dedicated auth helper and publication lifecycle", () => {
    const route = readFileSync(
      new URL("../app/api/cron/recipe-publish/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(route, /authorizeRecipePublishCronRequest/);
    assert.match(route, /runScheduledRecipePublishLifecycle/);
    assert.doesNotMatch(route, /authorizeCronRequest\(/);
    assert.doesNotMatch(route, /searchParams\.get\("secret"\)/);
  });

  it("vercel.json keeps only Hobby-compatible daily crons (no recipe-publish)", () => {
    const vercel = readFileSync(
      new URL("../../vercel.json", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(vercel, /recipe-publish/);
    assert.doesNotMatch(vercel, /\*\/10/);
    assert.match(vercel, /\/api\/cron\/youtube-sync/);
    assert.match(vercel, /0 6 \* \* \*/);
    assert.match(vercel, /\/api\/cron\/guest-retention/);
    assert.match(vercel, /0 7 \* \* \*/);
    assert.match(vercel, /\/api\/cron\/search-console/);
    assert.match(vercel, /0 8 \* \* \*/);
  });
});
