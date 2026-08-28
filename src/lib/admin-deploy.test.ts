import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAdminDeployLine, getAdminDeployInfo } from "./admin-deploy";

test("getAdminDeployInfo uses Vercel commit SHA and environment", () => {
  const info = getAdminDeployInfo({
    VERCEL_GIT_COMMIT_SHA: "f2a2524abc123def",
    VERCEL_ENV: "production",
  });
  assert.equal(info.shortSha, "f2a2524");
  assert.equal(info.fullSha, "f2a2524abc123def");
  assert.equal(info.envLabel, "Production");
  assert.equal(formatAdminDeployLine(info), "f2a2524 · Production");
});

test("getAdminDeployInfo falls back to Local without Vercel SHA", () => {
  const info = getAdminDeployInfo({});
  assert.equal(info.shortSha, "local");
  assert.equal(info.fullSha, null);
  assert.equal(info.envLabel, "Local");
});

test("getAdminDeployInfo labels preview deployments", () => {
  const info = getAdminDeployInfo({
    VERCEL_GIT_COMMIT_SHA: "abcdef0123456789",
    VERCEL_ENV: "preview",
  });
  assert.equal(info.envLabel, "Preview");
});
