import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chapterLabelOverrideInfo,
  clearSwappedAdjacentChapterLabels,
  detectSwappedAdjacentChapterLabels,
  listChapterLabelOverrides,
} from "@/lib/instruction-chapter-labels";
import {
  buildYoutubeChapterExport,
  formatYoutubeChapterBlock,
} from "@/lib/youtube-chapter-sync/export";
import { buildDescriptionPatchPlan } from "@/lib/youtube-chapter-sync/description-patch";
import { rebuildChapterSyncApplyPlan } from "@/lib/youtube-chapter-sync/apply-snapshot";
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

test("chapterLabel override uses explicit label for export", () => {
  const info = chapterLabelOverrideInfo({
    name: "Section A",
    steps: [""],
    chapterLabel: "YouTube B",
  });
  assert.equal(info.hasOverride, true);
  assert.equal(info.youtubeLabel, "YouTube B");
});

test("blank chapterLabel falls back to section title", () => {
  const info = chapterLabelOverrideInfo({
    name: "Preparing the Dough Base",
    steps: [""],
    chapterLabel: "  ",
  });
  assert.equal(info.hasOverride, false);
  assert.equal(info.youtubeLabel, "Preparing the Dough Base");
});

test("detectSwappedAdjacentChapterLabels finds cross-assigned labels", () => {
  const groups = [
    { name: "Preparing the Dough Base", steps: [""], chapterLabel: "Activating the Yeast" },
    { name: "Activating the Yeast", steps: [""], chapterLabel: "Preparing the Dough Base" },
  ];
  assert.deepEqual(detectSwappedAdjacentChapterLabels(groups), { indexA: 0, indexB: 1 });
});

test("clearSwappedAdjacentChapterLabels clears both overrides", () => {
  const groups = [
    { name: "Preparing the Dough Base", steps: [""], chapterLabel: "Activating the Yeast", startTimestamp: 0 },
    { name: "Activating the Yeast", steps: [""], chapterLabel: "Preparing the Dough Base", startTimestamp: 47 },
  ];
  const cleared = clearSwappedAdjacentChapterLabels(groups);
  assert.equal(cleared[0]?.chapterLabel, undefined);
  assert.equal(cleared[1]?.chapterLabel, undefined);
});

test("baguette corrected export uses section titles in instruction order", () => {
  const instructions = [
    { name: "Preparing the Dough Base", steps: [""], startTimestamp: 0 },
    { name: "Activating the Yeast", steps: [""], startTimestamp: 47 },
    { name: "Developing Gluten through Folding", steps: [""], startTimestamp: 89 },
    { name: "Shaping the Baguettes", steps: [""], startTimestamp: 169 },
    { name: "Final Proofing and Scoring", steps: [""], startTimestamp: 348 },
    { name: "Steam Baking for a Crispy Crust", steps: [""], startTimestamp: 381 },
  ];
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions,
    videoDurationSeconds: 420,
  });
  const block = formatYoutubeChapterBlock(result.items);
  assert.match(block, /^00:00 Preparing the Dough Base/);
  assert.match(block, /\n00:47 Activating the Yeast/);
  assert.equal(listChapterLabelOverrides(instructions).length, 0);
});

test("swapped chapter labels produce incorrect export until cleared", () => {
  const instructions = [
    { name: "Preparing the Dough Base", steps: [""], startTimestamp: 0, chapterLabel: "Activating the Yeast" },
    { name: "Activating the Yeast", steps: [""], startTimestamp: 47, chapterLabel: "Preparing the Dough Base" },
    { name: "Developing Gluten through Folding", steps: [""], startTimestamp: 89 },
  ];
  const wrong = buildYoutubeChapterExport({
    videoId: "abc",
    instructions,
    videoDurationSeconds: 420,
  });
  const wrongBlock = formatYoutubeChapterBlock(wrong.items);
  assert.match(wrongBlock, /^00:00 Activating the Yeast/);
  assert.match(wrongBlock, /\n00:47 Preparing the Dough Base/);

  const fixed = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: clearSwappedAdjacentChapterLabels(instructions),
    videoDurationSeconds: 420,
  });
  const fixedBlock = formatYoutubeChapterBlock(fixed.items);
  assert.match(fixedBlock, /^00:00 Preparing the Dough Base/);
  assert.match(fixedBlock, /\n00:47 Activating the Yeast/);
});

const BAGUETTE_CORRECTED_INSTRUCTIONS = [
  { name: "Preparing the Dough Base", steps: [""], startTimestamp: 0 },
  { name: "Activating the Yeast", steps: [""], startTimestamp: 47 },
  { name: "Developing Gluten through Folding", steps: [""], startTimestamp: 89 },
  { name: "Shaping the Baguettes", steps: [""], startTimestamp: 169 },
  { name: "Final Proofing and Scoring", steps: [""], startTimestamp: 348 },
  { name: "Steam Baking for a Crispy Crust", steps: [""], startTimestamp: 381 },
];

test("baguette corrected export matches full live YouTube chapter block", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: BAGUETTE_CORRECTED_INSTRUCTIONS,
    videoDurationSeconds: 420,
  });
  const block = formatYoutubeChapterBlock(result.items);
  assert.equal(
    block,
    [
      "00:00 Preparing the Dough Base",
      "00:47 Activating the Yeast",
      "01:29 Developing Gluten through Folding",
      "02:49 Shaping the Baguettes",
      "05:48 Final Proofing and Scoring",
      "06:21 Steam Baking for a Crispy Crust",
    ].join("\n"),
  );
});

test("baguette corrected chapters are already in sync with identical remote block", () => {
  const exportResult = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: BAGUETTE_CORRECTED_INSTRUCTIONS,
    videoDurationSeconds: 420,
  });
  const block = formatYoutubeChapterBlock(exportResult.items);
  const remoteDescription = ["Recipe intro copy.", "", block, "", "#bread"].join("\n");
  const plan = buildDescriptionPatchPlan({
    currentDescription: remoteDescription,
    exportItems: exportResult.items,
  });
  assert.equal(plan.strategy, "already_in_sync");
  assert.equal(plan.proposedDescription, remoteDescription);
});

test("baguette already in sync apply rebuild succeeds without requiring videos.update", () => {
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
  const exportResult = buildYoutubeChapterExport({
    videoId: "vid1",
    instructions: BAGUETTE_CORRECTED_INSTRUCTIONS,
    videoDurationSeconds: 420,
  });
  const block = formatYoutubeChapterBlock(exportResult.items);
  const remoteDescription = ["Recipe intro copy.", "", block, "", "#bread"].join("\n");
  const patch = buildDescriptionPatchPlan({
    currentDescription: remoteDescription,
    exportItems: exportResult.items,
  });
  assert.equal(patch.strategy, "already_in_sync");

  const { previewToken } = createChapterSyncPreviewToken({
    recipeId: "recipe1",
    videoId: "vid1",
    introLabel: "Introduction",
    beforeHash: descriptionContentHash(remoteDescription),
    remoteEtag: null,
    canonicalFingerprint: canonicalChapterFingerprint(BAGUETTE_CORRECTED_INSTRUCTIONS),
    exportFingerprint: youtubeExportFingerprint("Introduction", exportResult.items),
    replacementStrategy: patch.strategy,
    replacementBlockHash: chapterBlockHash(patch.existingChapterBlock ?? ""),
  });
  const verified = verifyChapterSyncPreviewToken(previewToken);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;

  const rebuilt = rebuildChapterSyncApplyPlan({
    snapshot: verified.payload,
    instructions: BAGUETTE_CORRECTED_INSTRUCTIONS,
    videoDurationSeconds: 420,
    remoteDescription,
  });
  assert.equal(rebuilt.ok, true);
  if (rebuilt.ok) {
    assert.equal(rebuilt.patchStrategy, "already_in_sync");
  }
});
