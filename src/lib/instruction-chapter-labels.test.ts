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
