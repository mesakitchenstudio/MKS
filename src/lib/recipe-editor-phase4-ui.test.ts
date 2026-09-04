import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(
  path.join(root, "../components/admin/InstructionsVideoVerificationLayout.tsx"),
  "utf8",
);
const accordion = readFileSync(
  path.join(root, "../components/admin/InstructionsAccordionEditor.tsx"),
  "utf8",
);
const suggestions = readFileSync(
  path.join(root, "../components/admin/ChapterTimestampSuggestionsPanel.tsx"),
  "utf8",
);
const syncPanel = readFileSync(
  path.join(root, "../components/admin/YoutubeChapterSyncPanel.tsx"),
  "utf8",
);
const videoWorkspace = readFileSync(
  path.join(root, "../components/admin/InstructionVideoWorkspace.tsx"),
  "utf8",
);
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const mediaEditor = readFileSync(
  path.join(root, "../components/admin/YoutubeMetadataEditor.tsx"),
  "utf8",
);

describe("Recipe editor Phase 4 Instructions contracts", () => {
  it("keeps a compact chapter mapping summary with Suggest / Review actions", () => {
    assert.match(suggestions, /data-testid="chapter-mapping-summary"/);
    assert.match(suggestions, /coverageSummary/);
    assert.match(suggestions, /Review all sections/);
    assert.match(suggestions, /generateSuggestions\("missing"\)/);
    assert.match(suggestions, /generateSuggestions\("all"\)/);
    assert.doesNotMatch(suggestions, /rounded-sm border border-line\/80 bg-paper\/50/);
  });

  it("presents healthy YouTube chapter sync quietly", () => {
    assert.match(syncPanel, /data-sync-state=\{needsAttention \? "needs-attention" : "healthy"\}/);
    assert.match(syncPanel, /YouTube chapters/);
    assert.match(syncPanel, /Ready for YouTube/);
    assert.match(syncPanel, /Preview YouTube chapters/);
    assert.doesNotMatch(syncPanel, /rounded-sm border border-line\/80 bg-white\/60 p-4/);
  });

  it("shows needs-attention chapter label overrides with Mesa vs YouTube distinction", () => {
    assert.match(syncPanel, /Chapter labels need review/);
    assert.match(syncPanel, /Mesa:/);
    assert.match(syncPanel, /YouTube:/);
    assert.match(syncPanel, /Export uses the YouTube chapter label/);
    assert.match(syncPanel, /border-l-2 border-terracotta/);
  });

  it("keeps collapsed sections as compact editorial rows", () => {
    assert.match(accordion, /data-section-expanded/);
    assert.match(accordion, /aria-expanded=\{expanded\}/);
    assert.match(accordion, /aria-controls=\{`instruction-section-panel-\$\{groupIndex\}`\}/);
    assert.match(accordion, /stepCount\} step/);
    assert.match(accordion, /formatTimestampInput\(canonicalStart\)/);
    assert.doesNotMatch(accordion, /border border-line\/80 bg-cream\/20/);
  });

  it("keeps expanded section title, chapter fields, and steps", () => {
    assert.match(accordion, /Section title|Section \$\{groupIndex \+ 1\}/);
    assert.match(accordion, /Chapter label/);
    assert.match(accordion, /Video chapter start for section/);
    assert.match(accordion, /Video chapter end for section/);
    assert.match(accordion, /Set from playhead/);
    assert.match(accordion, /Clear timestamp/);
    assert.match(accordion, /Set explicit end from playhead/);
    assert.match(accordion, /Leave blank to use the section title/);
    assert.match(accordion, /\+ Add step/);
    assert.match(accordion, /\+ Add section/);
  });

  it("keeps step controls with Improve under the textarea", () => {
    assert.match(accordion, /EditorDragHandle/);
    assert.match(accordion, /EditorRowActions/);
    assert.match(accordion, /GranularFieldAiSlot/);
    assert.match(accordion, /min-w-0 flex-1/);
    assert.match(accordion, /min-h-\[2\.75rem\]/);
  });

  it("stacks video above the editor below 2xl and keeps a desktop rail only at 2xl+", () => {
    assert.match(layout, /2xl:flex-row/);
    assert.match(layout, /order-1 min-w-0 2xl:order-2 2xl:flex-\[0_1_32%\]/);
    assert.match(layout, /order-2 min-w-0 2xl:order-1/);
    assert.match(layout, /2xl:flex-\[1_1_68%\]/);
    assert.doesNotMatch(layout, /\bxl:flex-row\b/);
    assert.doesNotMatch(layout, /\blg:flex-row\b/);
    assert.match(videoWorkspace, /2xl:sticky/);
    assert.doesNotMatch(videoWorkspace, /\bxl:sticky\b/);
    assert.match(videoWorkspace, /Hide video/);
    assert.match(videoWorkspace, /Open Media settings/);
  });

  it("preserves playhead actions and collapse/expand utilities", () => {
    assert.match(accordion, /onSetStartFromPlayhead/);
    assert.match(accordion, /onSetEndFromPlayhead/);
    assert.match(videoWorkspace, /Set start from/);
    assert.match(videoWorkspace, /Set end from/);
    assert.match(accordion, /Collapse all/);
    assert.match(accordion, /Expand all/);
    assert.match(accordion, /instructions-density-summary/);
  });

  it("does not redesign Media or Advanced in Phase 4", () => {
    assert.match(editor, /recipe-section-media/);
    assert.match(editor, /recipe-section-advanced/);
    assert.match(mediaEditor, /YOUTUBE_CHAPTER_SYNC_ENABLED/);
    assert.doesNotMatch(layout, /YoutubeMetadataEditor/);
    assert.doesNotMatch(accordion, /Floating YouTube/);
  });

  it("keeps chapter sync apply / preview behavior hooks", () => {
    assert.match(syncPanel, /\/api\/admin\/youtube\/chapter-sync\/preview/);
    assert.match(syncPanel, /\/api\/admin\/youtube\/chapter-sync\/apply/);
    assert.match(syncPanel, /Update YouTube description/);
    assert.match(syncPanel, /preview\.oauth\.canWrite/);
  });
});
