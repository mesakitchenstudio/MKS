import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createChapterSyncPreviewToken,
  verifyChapterSyncPreviewToken,
} from "@/lib/youtube-chapter-sync/preview-token";
import { descriptionContentHash } from "@/lib/youtube-chapter-sync/fingerprints";

test("preview token v2 round-trip without any server-side storage", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const { previewId, previewToken, expiresAt } = createChapterSyncPreviewToken({
    recipeId: "r1",
    videoId: "v1",
    introLabel: "Introduction",
    beforeHash: descriptionContentHash("before"),
    remoteEtag: "etag1",
    canonicalFingerprint: "fp1",
    exportFingerprint: "exp1",
    replacementStrategy: "append",
    replacementBlockHash: "",
    ttlMs: 60_000,
  });
  assert.ok(previewId);
  assert.ok(previewToken.includes("."));
  assert.ok(expiresAt > Date.now());

  const verified = verifyChapterSyncPreviewToken(previewToken);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.payload.v, 2);
    assert.equal(verified.payload.recipeId, "r1");
    assert.equal(verified.payload.exportFingerprint, "exp1");
  }
});

test("preview token rejects tampered signature", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const { previewToken } = createChapterSyncPreviewToken({
    recipeId: "r1",
    videoId: "v1",
    introLabel: "Introduction",
    beforeHash: "abc",
    remoteEtag: null,
    canonicalFingerprint: "fp1",
    exportFingerprint: "exp1",
    replacementStrategy: "append",
    replacementBlockHash: "",
  });
  const tampered = `${previewToken.slice(0, -1)}x`;
  const verified = verifyChapterSyncPreviewToken(tampered);
  assert.equal(verified.ok, false);
});

test("preview token rejects v1 legacy tokens", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const payload = Buffer.from(JSON.stringify({ v: 1, previewId: "x" })).toString("base64url");
  const verified = verifyChapterSyncPreviewToken(`${payload}.deadbeef`);
  assert.equal(verified.ok, false);
});
