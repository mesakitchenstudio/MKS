import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDescriptionPatchPlan,
  detectChapterBlocks,
  findExactBlockSpan,
  validateProposedDescriptionBytes,
} from "@/lib/youtube-chapter-sync/description-patch";
import { formatYoutubeChapterBlock } from "@/lib/youtube-chapter-sync/export";
import { utf8ByteLength } from "@/lib/youtube-chapter-sync/utf8-bytes";

const exportItems = [
  { timestamp: 0, label: "Introduction", source: "synthetic_intro" as const },
  { timestamp: 12, label: "Mix", source: "mesa_section" as const },
  { timestamp: 90, label: "Bake", source: "mesa_section" as const },
  { timestamp: 180, label: "Cool", source: "mesa_section" as const },
];

test("patch A: replace one valid chapter block only", () => {
  const current = [
    "Shop: https://example.com/tools",
    "",
    "0:00 Old intro",
    "1:00 Old mix",
    "3:00 Old bake",
    "",
    "#bread",
  ].join("\n");
  const plan = buildDescriptionPatchPlan({ currentDescription: current, exportItems });
  assert.equal(plan.strategy, "replace_detected");
  assert.match(plan.proposedDescription, /Shop: https:\/\/example.com\/tools/);
  assert.match(plan.proposedDescription, /#bread/);
  assert.match(plan.proposedDescription, /00:12 Mix/);
  assert.doesNotMatch(plan.proposedDescription, /Old intro/);
});

test("patch B: append when no chapter block", () => {
  const current = "Body copy only.\n\nThanks for watching!";
  const plan = buildDescriptionPatchPlan({ currentDescription: current, exportItems });
  assert.equal(plan.strategy, "append");
  assert.match(plan.proposedDescription, /Body copy only/);
  assert.match(plan.proposedDescription, /00:00 Introduction/);
});

test("patch C: prose timestamps are not removed", () => {
  const current = "Bake for 20 minutes. See 3:15 in the video.\n\nMore prose.";
  const blocks = detectChapterBlocks(current);
  assert.equal(blocks.length, 0);
  const plan = buildDescriptionPatchPlan({ currentDescription: current, exportItems });
  assert.match(plan.proposedDescription, /See 3:15 in the video/);
});

test("patch D: multiple blocks → ambiguous", () => {
  const current = [
    "0:00 Block1 A",
    "1:00 Block1 B",
    "2:00 Block1 C",
    "",
    "Prose middle",
    "",
    "0:00 Block2 A",
    "1:00 Block2 B",
    "2:00 Block2 C",
  ].join("\n");
  const plan = buildDescriptionPatchPlan({ currentDescription: current, exportItems });
  assert.equal(plan.strategy, "ambiguous");
});

test("patch E: previously synced exact block preferred", () => {
  const synced = "0:00 Mesa A\n1:00 Mesa B\n2:00 Mesa C";
  const current = `Intro copy\n\n${synced}\n\nFooter`;
  const plan = buildDescriptionPatchPlan({
    currentDescription: current,
    exportItems,
    lastSyncedChapterBlock: synced,
  });
  assert.equal(plan.strategy, "replace_previous_mesa");
  assert.match(plan.proposedDescription, /Intro copy/);
  assert.match(plan.proposedDescription, /Footer/);
});

test("patch F/G: prefix and suffix preserved byte-for-byte", () => {
  const prefix = "Keep me exactly";
  const suffix = "and me too";
  const oldBlock = "0:00 Old\n1:00 Old2\n2:00 Old3";
  const current = `${prefix}\n\n${oldBlock}\n\n${suffix}`;
  const plan = buildDescriptionPatchPlan({
    currentDescription: current,
    exportItems,
    lastSyncedChapterBlock: oldBlock,
  });
  assert.ok(plan.proposedDescription.startsWith(`${prefix}\n\n`));
  assert.ok(plan.proposedDescription.endsWith(`\n\n${suffix}`));
});

test("patch H: links and hashtags preserved", () => {
  const current = "Link https://example.com\n#tag\n\n0:00 A\n1:00 B\n2:00 C";
  const plan = buildDescriptionPatchPlan({ currentDescription: current, exportItems });
  assert.match(plan.proposedDescription, /https:\/\/example.com/);
  assert.match(plan.proposedDescription, /#tag/);
});

test("patch I: UTF-8 byte length validation", () => {
  const heavy = "😀".repeat(2000);
  const check = validateProposedDescriptionBytes(heavy);
  assert.equal(check.ok, false);
  assert.ok(utf8ByteLength(heavy) > check.limit);
});

test("patch J: already identical → in sync", () => {
  const block = formatYoutubeChapterBlock(exportItems);
  const plan = buildDescriptionPatchPlan({
    currentDescription: block,
    exportItems,
  });
  assert.equal(plan.strategy, "already_in_sync");
});

test("findExactBlockSpan rejects ambiguous duplicate blocks", () => {
  const text = "aaa\nbbb\naaa";
  assert.equal(findExactBlockSpan(text, "aaa"), null);
});
