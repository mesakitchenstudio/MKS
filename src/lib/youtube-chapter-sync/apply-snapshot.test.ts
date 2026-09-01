import assert from "node:assert/strict";
import { test } from "node:test";
import { rebuildChapterSyncApplyPlan } from "@/lib/youtube-chapter-sync/apply-snapshot";
import { buildDescriptionPatchPlan } from "@/lib/youtube-chapter-sync/description-patch";
import {
  canonicalChapterFingerprint,
  chapterBlockHash,
  descriptionContentHash,
  youtubeExportFingerprint,
} from "@/lib/youtube-chapter-sync/fingerprints";
import {
  createChapterSyncPreviewToken,
  verifyChapterSyncPreviewToken,
} from "@/lib/youtube-chapter-sync/preview-token";
import { buildYoutubeChapterExport } from "@/lib/youtube-chapter-sync/export";

const instructions = [
  { name: "Mix", steps: [""], startTimestamp: 0, chapterLabel: "Mix" },
  { name: "Bake", steps: [""], startTimestamp: 90, chapterLabel: "Bake" },
  { name: "Cool", steps: [""], startTimestamp: 180, chapterLabel: "Cool" },
];

test("stateless apply rebuild succeeds with signed token only — no process memory", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";

  const remoteDescription = "Recipe intro copy.\n\n#bread";
  const exportResult = buildYoutubeChapterExport({
    videoId: "vid1",
    instructions,
    videoDurationSeconds: 300,
    introLabel: "Introduction",
  });
  const patch = buildDescriptionPatchPlan({
    currentDescription: remoteDescription,
    exportItems: exportResult.items,
  });
  const fingerprint = canonicalChapterFingerprint(instructions);
  const introLabel = "Introduction";

  const { previewToken } = createChapterSyncPreviewToken({
    recipeId: "recipe1",
    videoId: "vid1",
    introLabel,
    beforeHash: descriptionContentHash(remoteDescription),
    remoteEtag: null,
    canonicalFingerprint: fingerprint,
    exportFingerprint: youtubeExportFingerprint(introLabel, exportResult.items),
    replacementStrategy: patch.strategy,
    replacementBlockHash: chapterBlockHash(patch.existingChapterBlock ?? ""),
  });

  const verified = verifyChapterSyncPreviewToken(previewToken);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;

  const rebuilt = rebuildChapterSyncApplyPlan({
    snapshot: verified.payload,
    instructions,
    videoDurationSeconds: 300,
    remoteDescription,
  });

  assert.equal(rebuilt.ok, true);
  if (rebuilt.ok) {
    assert.equal(rebuilt.proposedDescription, patch.proposedDescription);
    assert.match(rebuilt.proposedDescription, /00:00 Mix/);
  }
});

test("apply rebuild blocks remote description drift", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const remoteDescription = "Original";
  const exportResult = buildYoutubeChapterExport({
    videoId: "vid1",
    instructions,
    videoDurationSeconds: 300,
  });
  const patch = buildDescriptionPatchPlan({
    currentDescription: remoteDescription,
    exportItems: exportResult.items,
  });
  const { previewToken } = createChapterSyncPreviewToken({
    recipeId: "recipe1",
    videoId: "vid1",
    introLabel: "Introduction",
    beforeHash: descriptionContentHash(remoteDescription),
    remoteEtag: null,
    canonicalFingerprint: canonicalChapterFingerprint(instructions),
    exportFingerprint: youtubeExportFingerprint("Introduction", exportResult.items),
    replacementStrategy: patch.strategy,
    replacementBlockHash: chapterBlockHash(patch.existingChapterBlock ?? ""),
  });
  const verified = verifyChapterSyncPreviewToken(previewToken);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;

  const rebuilt = rebuildChapterSyncApplyPlan({
    snapshot: verified.payload,
    instructions,
    videoDurationSeconds: 300,
    remoteDescription: "Someone edited this on YouTube",
  });
  assert.equal(rebuilt.ok, false);
  if (!rebuilt.ok) {
    assert.equal(rebuilt.code, "remote_drift");
  }
});

test("apply rebuild blocks canonical fingerprint drift", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const remoteDescription = "Original";
  const exportResult = buildYoutubeChapterExport({
    videoId: "vid1",
    instructions,
    videoDurationSeconds: 300,
  });
  const patch = buildDescriptionPatchPlan({
    currentDescription: remoteDescription,
    exportItems: exportResult.items,
  });
  const { previewToken } = createChapterSyncPreviewToken({
    recipeId: "recipe1",
    videoId: "vid1",
    introLabel: "Introduction",
    beforeHash: descriptionContentHash(remoteDescription),
    remoteEtag: null,
    canonicalFingerprint: canonicalChapterFingerprint(instructions),
    exportFingerprint: youtubeExportFingerprint("Introduction", exportResult.items),
    replacementStrategy: patch.strategy,
    replacementBlockHash: chapterBlockHash(patch.existingChapterBlock ?? ""),
  });
  const verified = verifyChapterSyncPreviewToken(previewToken);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;

  const changedInstructions = [
    ...instructions.slice(0, 2),
    { name: "Cool", steps: [""], startTimestamp: 200, chapterLabel: "Cool" },
  ];
  const rebuilt = rebuildChapterSyncApplyPlan({
    snapshot: verified.payload,
    instructions: changedInstructions,
    videoDurationSeconds: 300,
    remoteDescription,
  });
  assert.equal(rebuilt.ok, false);
  if (!rebuilt.ok) {
    assert.equal(rebuilt.code, "canonical_changed");
  }
});

test("apply rebuild blocks linked video change", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const { previewToken } = createChapterSyncPreviewToken({
    recipeId: "recipe1",
    videoId: "vid1",
    introLabel: "Introduction",
    beforeHash: descriptionContentHash("x"),
    remoteEtag: null,
    canonicalFingerprint: canonicalChapterFingerprint(instructions),
    exportFingerprint: "abc",
    replacementStrategy: "append",
    replacementBlockHash: "",
  });
  const verified = verifyChapterSyncPreviewToken(previewToken);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.notEqual(verified.payload.videoId, "vid2");
});
