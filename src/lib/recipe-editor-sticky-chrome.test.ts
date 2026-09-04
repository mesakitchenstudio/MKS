import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const sectionNav = readFileSync(
  path.join(root, "../components/admin/RecipeEditorSectionNav.tsx"),
  "utf8",
);
const stickyBar = readFileSync(
  path.join(root, "../components/admin/EditorStickyActionBar.tsx"),
  "utf8",
);
const fieldOverflow = readFileSync(
  path.join(root, "../components/admin/FieldOverflowMenu.tsx"),
  "utf8",
);
const rowActions = readFileSync(path.join(root, "../components/admin/EditorRowActions.tsx"), "utf8");

describe("Recipe editor sticky chrome coverage", () => {
  it("uses full-bleed opaque sticky header without translucent blur", () => {
    assert.match(editor, /ref=\{stickyHeaderRef\}/);
    assert.match(editor, /sticky top-0 z-50 isolate/);
    assert.match(editor, /adminRecipeEditorStickyBleedClass/);
    assert.match(editor, /bg-\[var\(--cream\)\]/);
    assert.doesNotMatch(editor, /sticky top-0[\s\S]{0,160}bg-\[var\(--cream\)\]\/95/);
    assert.doesNotMatch(editor, /sticky top-0[\s\S]{0,200}backdrop-blur/);
    assert.doesNotMatch(editor, /sticky top-0 z-50 -mx-5 mb-6/);
  });

  it("keeps section nav sticky under the header with matching opaque coverage", () => {
    assert.match(sectionNav, /sticky z-50 isolate/);
    assert.match(sectionNav, /style=\{\{ top: stickyTop/);
    assert.match(sectionNav, /adminRecipeEditorStickyBleedClass/);
    assert.match(sectionNav, /bg-\[var\(--cream\)\]/);
    assert.doesNotMatch(sectionNav, /bg-\[var\(--cream\)\]\/95/);
    assert.doesNotMatch(sectionNav, /backdrop-blur/);
    assert.doesNotMatch(sectionNav, /sticky z-40/);
  });

  it("keeps bottom action bar opaque and layers field menus below sticky chrome", () => {
    assert.match(stickyBar, /fixed inset-x-0 bottom-0 z-50/);
    assert.match(stickyBar, /bg-\[var\(--cream\)\]/);
    assert.doesNotMatch(stickyBar, /bg-\[var\(--cream\)\]\/95/);
    assert.doesNotMatch(stickyBar, /backdrop-blur/);
    assert.match(fieldOverflow, /z-30/);
    assert.match(rowActions, /z-30/);
    assert.match(editor, /z-\[60\]/);
  });
});
