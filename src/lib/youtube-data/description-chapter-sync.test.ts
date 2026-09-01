import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildYoutubeDescriptionChapterPreview,
  formatYoutubeChapterBlock,
  MESA_CHAPTER_BLOCK_END,
  MESA_CHAPTER_BLOCK_START,
  stripManagedChapterBlocks,
  youtubeChapterSyncEnabled,
} from "./description-chapter-sync";

test("stripManagedChapterBlocks preserves non-chapter body", () => {
  const description = [
    "Learn crusty baguettes at home.",
    "",
    "0:00 Intro",
    "1:00 Mix",
    "2:00 Bake",
    "",
    "Shop tools: https://example.com",
  ].join("\n");
  const body = stripManagedChapterBlocks(description);
  assert.match(body, /Learn crusty baguettes/);
  assert.match(body, /Shop tools/);
  assert.doesNotMatch(body, /0:00 Intro/);
});

test("buildYoutubeDescriptionChapterPreview replaces legacy marker block visibly", () => {
  const current = [
    "Body copy stays.",
    "",
    MESA_CHAPTER_BLOCK_START,
    "0:00 Old",
    "1:00 Old2",
    "2:00 Old3",
    MESA_CHAPTER_BLOCK_END,
  ].join("\n");
  const preview = buildYoutubeDescriptionChapterPreview({
    currentDescription: current,
    chapters: [
      { time: 0, label: "Mix" },
      { time: 90, label: "Bake" },
      { time: 180, label: "Cool" },
    ],
  });
  assert.equal(preview.wouldChange, true);
  assert.match(preview.nextDescription, /Body copy stays/);
  assert.match(preview.nextDescription, /00:00 Mix/);
  assert.ok(!preview.nextDescription.includes(MESA_CHAPTER_BLOCK_START));
  assert.match(preview.chapterBlock, /00:00 Mix/);
});

test("formatYoutubeChapterBlock orders timestamps without markers", () => {
  const block = formatYoutubeChapterBlock([
    { time: 90, label: "Bake" },
    { time: 0, label: "Mix" },
    { time: 180, label: "Cool" },
  ]);
  assert.ok(block.indexOf("00:00 Mix") < block.indexOf("01:30 Bake"));
  assert.ok(!block.includes("mesa-chapters"));
});

test("youtubeChapterSyncEnabled defaults false", (t) => {
  const prior = process.env.YOUTUBE_CHAPTER_SYNC_ENABLED;
  t.after(() => {
    if (prior === undefined) delete process.env.YOUTUBE_CHAPTER_SYNC_ENABLED;
    else process.env.YOUTUBE_CHAPTER_SYNC_ENABLED = prior;
  });
  delete process.env.YOUTUBE_CHAPTER_SYNC_ENABLED;
  assert.equal(youtubeChapterSyncEnabled(), false);
});
