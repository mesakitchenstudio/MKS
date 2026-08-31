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
    "",
    "Shop tools: https://example.com",
  ].join("\n");
  const body = stripManagedChapterBlocks(description);
  assert.match(body, /Learn crusty baguettes/);
  assert.match(body, /Shop tools/);
  assert.doesNotMatch(body, /0:00 Intro/);
});

test("buildYoutubeDescriptionChapterPreview replaces chapter block without duplicating", () => {
  const current = [
    "Body copy stays.",
    "",
    MESA_CHAPTER_BLOCK_START,
    "0:00 Old",
    MESA_CHAPTER_BLOCK_END,
  ].join("\n");
  const preview = buildYoutubeDescriptionChapterPreview({
    currentDescription: current,
    chapters: [
      { time: 0, label: "Mix" },
      { time: 90, label: "Bake" },
    ],
  });
  assert.equal(preview.wouldChange, true);
  assert.match(preview.nextDescription, /Body copy stays/);
  assert.match(preview.nextDescription, /0:00 Mix/);
  assert.match(preview.nextDescription, /1:30 Bake/);
  assert.equal(preview.nextDescription.split(MESA_CHAPTER_BLOCK_START).length - 1, 1);
});

test("formatYoutubeChapterBlock orders timestamps", () => {
  const block = formatYoutubeChapterBlock([
    { time: 90, label: "Bake" },
    { time: 0, label: "Mix" },
  ]);
  assert.ok(block.indexOf("0:00 Mix") < block.indexOf("1:30 Bake"));
});

test("youtubeChapterSyncEnabled defaults false", () => {
  assert.equal(youtubeChapterSyncEnabled(), false);
});
