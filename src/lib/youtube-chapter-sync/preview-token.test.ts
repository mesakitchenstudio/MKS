import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  createChapterSyncPreviewToken,
  verifyChapterSyncPreviewToken,
  storePreviewToken,
  resolvePreviewToken,
  clearAllPreviewTokensForTests,
} from "@/lib/youtube-chapter-sync/preview-token";
import { descriptionContentHash } from "@/lib/youtube-chapter-sync/fingerprints";

test("preview token round-trip and expiry", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const { previewId, token, expiresAt } = createChapterSyncPreviewToken({
    recipeId: "r1",
    videoId: "v1",
    introLabel: "Introduction",
    beforeHash: descriptionContentHash("before"),
    remoteEtag: "etag1",
    canonicalFingerprint: "fp1",
    replacementStrategy: "append",
    ttlMs: 60_000,
  });
  storePreviewToken(previewId, token, expiresAt);
  assert.equal(resolvePreviewToken(previewId), token);
  const verified = verifyChapterSyncPreviewToken(token);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.payload.recipeId, "r1");
    assert.equal(verified.payload.videoId, "v1");
  }
  clearAllPreviewTokensForTests();
});

test("preview token rejects tampered signature", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const { token } = createChapterSyncPreviewToken({
    recipeId: "r1",
    videoId: "v1",
    introLabel: "Introduction",
    beforeHash: "abc",
    remoteEtag: null,
    canonicalFingerprint: "fp1",
    replacementStrategy: "append",
  });
  const tampered = `${token.slice(0, -1)}x`;
  const verified = verifyChapterSyncPreviewToken(tampered);
  assert.equal(verified.ok, false);
});
