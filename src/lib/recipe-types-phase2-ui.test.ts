import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CORE_FIELDS } from "./fields";
import {
  annotateTypeFieldSectionRuns,
  coreFieldsDefaultSectionSequence,
  editorSectionForTypeFieldKey,
  isSectionSequenceContiguous,
  TYPE_FIELD_SECTION_DESCRIPTIONS,
  TYPE_FIELD_SECTION_LABELS,
} from "./recipe-type-field-sections";

const root = path.dirname(fileURLToPath(import.meta.url));
const typeFieldsManager = readFileSync(
  path.join(root, "../components/admin/TypeFieldsManager.tsx"),
  "utf8",
);
const actions = readFileSync(path.join(root, "../app/admin/actions.ts"), "utf8");
const sectionsLib = readFileSync(path.join(root, "recipe-type-field-sections.ts"), "utf8");
const typesPage = readFileSync(path.join(root, "../app/admin/(app)/types/page.tsx"), "utf8");

describe("Recipe Types Phase 2 visual section grouping", () => {
  it("maps representative core keys to Recipe Editor placement sections", () => {
    assert.equal(editorSectionForTypeFieldKey("image"), "media");
    assert.equal(editorSectionForTypeFieldKey("imageAlt"), "media");
    assert.equal(editorSectionForTypeFieldKey("youtubeUrl"), "media");
    assert.equal(editorSectionForTypeFieldKey("floatingYoutubeUrl"), "advanced");
    assert.equal(editorSectionForTypeFieldKey("youtube"), "advanced");
    assert.equal(editorSectionForTypeFieldKey("nutrition"), "advanced");
    assert.equal(editorSectionForTypeFieldKey("intro"), "content");
    assert.equal(editorSectionForTypeFieldKey("ingredients"), "content");
    assert.equal(editorSectionForTypeFieldKey("instructions"), "content");
    assert.equal(editorSectionForTypeFieldKey("prepMinutes"), "details");
    assert.equal(editorSectionForTypeFieldKey("servings"), "details");
    assert.equal(editorSectionForTypeFieldKey("tags"), "details");
    assert.equal(editorSectionForTypeFieldKey("cookMinutes"), "details");
    assert.equal(editorSectionForTypeFieldKey("title"), "basics");
    assert.equal(editorSectionForTypeFieldKey("excerpt"), "basics");
  });

  it("falls back type-specific / unknown keys to Advanced like Recipe Editor specialists", () => {
    assert.equal(editorSectionForTypeFieldKey("riseHours"), "advanced");
    assert.equal(editorSectionForTypeFieldKey("frostingNotes"), "advanced");
    assert.equal(editorSectionForTypeFieldKey("customWidget"), "advanced");
  });

  it("documents that default CORE_FIELDS sortOrder is not contiguous by section", () => {
    const sequence = coreFieldsDefaultSectionSequence();
    assert.equal(sequence.length, CORE_FIELDS.length);
    assert.equal(isSectionSequenceContiguous(sequence), false);
    const runs: string[] = [];
    for (const section of sequence) {
      if (runs.length === 0 || runs[runs.length - 1] !== section) runs.push(section);
    }
    // Media → Advanced → Content → Details → Content → Advanced (Content/Advanced re-enter)
    assert.deepEqual(runs, ["media", "advanced", "content", "details", "content", "advanced"]);
  });

  it("annotates section runs without reordering fields", () => {
    const fields = [
      { id: "1", key: "ingredients", sortOrder: 0 },
      { id: "2", key: "image", sortOrder: 1 },
      { id: "3", key: "riseHours", sortOrder: 2 },
      { id: "4", key: "notes", sortOrder: 3 },
    ];
    const runs = annotateTypeFieldSectionRuns(fields);
    assert.deepEqual(
      runs.map((row) => row.field.key),
      ["ingredients", "image", "riseHours", "notes"],
    );
    assert.deepEqual(
      runs.map((row) => row.field.sortOrder),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      runs.map((row) => row.section),
      ["content", "media", "advanced", "content"],
    );
    assert.deepEqual(
      runs.map((row) => row.showSectionMarker),
      [true, true, true, true],
    );
    assert.deepEqual(
      runs.map((row) => row.isFirstSectionOccurrence),
      [true, true, true, false],
    );
  });

  it("omits repeated markers inside a contiguous section run", () => {
    const runs = annotateTypeFieldSectionRuns([
      { key: "prepMinutes" },
      { key: "bakeMinutes" },
      { key: "intro" },
      { key: "notes" },
    ]);
    assert.deepEqual(
      runs.map((row) => row.showSectionMarker),
      [true, false, true, false],
    );
    assert.deepEqual(
      runs.map((row) => row.isFirstSectionOccurrence),
      [true, false, true, false],
    );
  });

  it("marks later returns to a section as continuations without changing order", () => {
    const runs = annotateTypeFieldSectionRuns([
      { key: "image" },
      { key: "intro" },
      { key: "prepMinutes" },
      { key: "ingredients" },
      { key: "nutrition" },
      { key: "tags" },
      { key: "imageAlt" },
      { key: "youtube" },
    ]);
    const markers = runs.filter((row) => row.showSectionMarker);
    assert.deepEqual(
      markers.map((row) => ({
        section: row.section,
        first: row.isFirstSectionOccurrence,
      })),
      [
        { section: "media", first: true },
        { section: "content", first: true },
        { section: "details", first: true },
        { section: "content", first: false },
        { section: "advanced", first: true },
        { section: "details", first: false },
        { section: "media", first: false },
        { section: "advanced", first: false },
      ],
    );
  });

  it("calculates first occurrence from the visible filtered list only", () => {
    const all = annotateTypeFieldSectionRuns([
      { key: "image" },
      { key: "intro" },
      { key: "ingredients" },
    ]);
    assert.equal(all[2].section, "content");
    assert.equal(all[2].showSectionMarker, false);

    // Required-style subset where Content is the first visible section
    const filtered = annotateTypeFieldSectionRuns([{ key: "ingredients" }, { key: "notes" }]);
    assert.equal(filtered[0].section, "content");
    assert.equal(filtered[0].isFirstSectionOccurrence, true);
    assert.equal(filtered[1].showSectionMarker, false);
  });

  it("wires full helpers for first occurrence and continued markers for repeats", () => {
    assert.match(typeFieldsManager, /annotateTypeFieldSectionRuns/);
    assert.match(typeFieldsManager, /FieldSectionMarker/);
    assert.match(typeFieldsManager, /isFirstSectionOccurrence/);
    assert.match(typeFieldsManager, /continued=\{!isFirstSectionOccurrence\}/);
    assert.match(typeFieldsManager, /\{label\} · Continued/);
    assert.match(typeFieldsManager, /TYPE_FIELD_SECTION_DESCRIPTIONS\[section\]/);
    assert.match(typeFieldsManager, /continued \? \(/);
    assert.equal(TYPE_FIELD_SECTION_LABELS.details, "Details");
    assert.match(TYPE_FIELD_SECTION_DESCRIPTIONS.media, /Hero image/);
  });

  it("keeps inline field edit quieter without changing actions or fields", () => {
    assert.match(typeFieldsManager, /border-l-2 border-olive\/30 bg-cream\/20/);
    assert.match(typeFieldsManager, /Save field/);
    assert.match(typeFieldsManager, /Cancel/);
    assert.match(typeFieldsManager, /Required on publish/);
    assert.match(typeFieldsManager, /label="Label"/);
    assert.match(typeFieldsManager, /label="Key"/);
    assert.match(typeFieldsManager, /label="Kind"/);
    assert.match(typeFieldsManager, /label="Help text"/);
    assert.match(typeFieldsManager, /saveFieldAction/);
    assert.doesNotMatch(typeFieldsManager, /drawer|slide-over|Dialog/i);
  });

  it("keeps flat sortOrder sort and does not rewrite order for grouping", () => {
    assert.match(typeFieldsManager, /sort\(\(a, b\) => a\.sortOrder - b\.sortOrder\)/);
    assert.doesNotMatch(typeFieldsManager, /sortOrder\s*=/);
    assert.doesNotMatch(sectionsLib, /prisma|updateMany|sortOrder:/);
    assert.doesNotMatch(typeFieldsManager, /dnd|drag|Drop|sortable/i);
  });

  it("preserves moveFieldAction contract for cross-section ↑/↓", () => {
    assert.match(typeFieldsManager, /moveFieldAction/);
    assert.match(typeFieldsManager, /direction" value="up"/);
    assert.match(typeFieldsManager, /direction" value="down"/);
    assert.match(typeFieldsManager, /reorderDisabled = filter !== "all"/);
    assert.match(actions, /export async function moveFieldAction/);
    const moveBlock = actions.slice(actions.indexOf("export async function moveFieldAction"));
    assert.match(moveBlock, /sortOrder/);
    assert.match(moveBlock, /\$transaction/);
    assert.doesNotMatch(moveBlock, /editorSectionForTypeFieldKey|section/);
  });

  it("keeps Phase 1 filter, required, type-specific, and technical-key behavior", () => {
    assert.match(typeFieldsManager, /Switch to All to reorder fields/);
    assert.match(typeFieldsManager, /Show technical keys/);
    assert.match(typeFieldsManager, /font-semibold text-terracotta">Required/);
    assert.match(typeFieldsManager, /font-medium text-olive/);
    assert.match(typeFieldsManager, /Type-specific/);
    assert.doesNotMatch(typeFieldsManager, /Used across recipe types/);
  });

  it("does not redesign the Recipe Types index in Phase 2", () => {
    assert.doesNotMatch(typesPage, /annotateTypeFieldSectionRuns|FieldSectionMarker/);
    assert.match(typesPage, /New recipe type|AddTypeForm/);
  });

  it("avoids empty section headings by marking only visible field runs", () => {
    assert.match(typeFieldsManager, /visibleSectionRuns = annotateTypeFieldSectionRuns\(visibleFields\)/);
    assert.match(typeFieldsManager, /\{showSectionMarker \? \(/);
    assert.doesNotMatch(typeFieldsManager, /TYPE_FIELD_SECTION_ORDER\.map/);
  });
});
