import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminRecipeEditorStickyBleedClass,
  adminWorkspacePaddingClass,
} from "./admin-ui";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const sectionNav = readFileSync(
  path.join(root, "../components/admin/RecipeEditorSectionNav.tsx"),
  "utf8",
);
const shell = readFileSync(path.join(root, "../components/admin/AdminShell.tsx"), "utf8");

describe("Recipe editor sticky paint containment", () => {
  it("mirrors workspace padding bleed so sticky chrome covers the full editor column", () => {
    assert.match(adminWorkspacePaddingClass, /lg:pl-24/);
    assert.match(adminWorkspacePaddingClass, /lg:pr-10/);
    assert.match(adminWorkspacePaddingClass, /xl:pl-28/);
    assert.match(adminRecipeEditorStickyBleedClass, /lg:-ml-24/);
    assert.match(adminRecipeEditorStickyBleedClass, /lg:-mr-10/);
    assert.match(adminRecipeEditorStickyBleedClass, /xl:-ml-28/);
    assert.doesNotMatch(adminRecipeEditorStickyBleedClass, /w-screen|100vw/);
    assert.match(editor, /adminRecipeEditorStickyBleedClass/);
    assert.match(sectionNav, /adminRecipeEditorStickyBleedClass/);
  });

  it("uses opaque isolated sticky layers and clips horizontal spill in the editor root", () => {
    assert.match(editor, /relative isolate min-w-0 max-w-full overflow-x-clip/);
    assert.match(editor, /sticky top-0 z-50 isolate/);
    assert.match(editor, /bg-\[var\(--cream\)\]/);
    assert.doesNotMatch(editor, /sticky top-0[\s\S]{0,200}bg-\[var\(--cream\)\]\/9/);
    assert.doesNotMatch(editor, /sticky top-0[\s\S]{0,220}backdrop-blur/);
    assert.match(sectionNav, /sticky z-50 isolate/);
    assert.match(sectionNav, /bg-\[var\(--cream\)\]/);
    assert.doesNotMatch(sectionNav, /bg-\[var\(--cream\)\]\/9/);
    assert.doesNotMatch(sectionNav, /backdrop-blur/);
    assert.match(shell, /main className="min-w-0 flex-1"/);
    assert.match(shell, /min-w-0 w-full/);
  });

  it("keeps category disclosure rows contained at tablet widths", () => {
    const categories = editor.slice(
      editor.indexOf(">Categories<"),
      editor.indexOf('id={SECTION_DETAILS}'),
    );
    assert.match(categories, /min-w-0 max-w-full/);
    assert.match(categories, /min-w-0 flex-1 truncate/);
    assert.match(categories, /shrink-0 text-xs text-muted/);
    assert.match(categories, /min-w-0 break-words/);
    assert.doesNotMatch(categories, /whitespace-nowrap/);
  });
});
