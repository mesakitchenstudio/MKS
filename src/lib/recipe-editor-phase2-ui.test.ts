import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { coerceStringList } from "./coerce-string-list";
import { adminWorkspaceWide } from "./admin-ui";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const utensils = readFileSync(path.join(root, "../components/admin/UtensilsChipEditor.tsx"), "utf8");
const tags = readFileSync(path.join(root, "../components/admin/TagsChipEditor.tsx"), "utf8");
const phase1 = readFileSync(path.join(root, "recipe-editor-phase1-ui.test.ts"), "utf8");

describe("Recipe editor Phase 2 Basics/Details contracts", () => {
  it("keeps Basics Identity fields and Discovery flags without moving sections", () => {
    assert.match(editor, /recipe-section-basics/);
    assert.match(editor, />\s*Identity\s*</);
    assert.match(editor, /name="title"/);
    assert.match(editor, /name="slug"/);
    assert.match(editor, /name="excerpt"/);
    assert.match(editor, /name="featured"/);
    assert.match(editor, /name="seasonal"/);
    assert.match(editor, />\s*Discovery\s*</);
    assert.match(editor, /Categories/);
    assert.match(editor, /categoryIds/);
    assert.match(editor, /toggleCategory/);
    assert.match(editor, /path="categoryIds"/);
    const basicsJsx = editor.slice(
      editor.indexOf('id={SECTION_BASICS}'),
      editor.indexOf('id={SECTION_DETAILS}'),
    );
    assert.match(basicsJsx, /Identity/);
    assert.match(basicsJsx, /name="title"/);
    assert.doesNotMatch(basicsJsx, /name={`field:servings`}|prepMinutes|utensils/);
  });

  it("de-emphasizes slug and measures excerpt for editorial width", () => {
    assert.match(editor, /id="recipe-field-slug"/);
    assert.match(editor, /max-w-sm/);
    assert.match(editor, /id="recipe-field-excerpt"/);
    assert.match(editor, /max-w-\[72ch\]/);
    assert.equal(adminWorkspaceWide, "max-w-[77.5rem]");
  });

  it("uses quiet category summary and disclosure groups without nested cages", () => {
    assert.match(editor, /selectedInGroup/);
    assert.match(editor, /\$\{selectedInGroup\} selected/);
    assert.match(editor, /Remove \$\{category\.name\}/);
    assert.match(editor, /border-b border-line\/60/);
    const categoriesJsx = editor.slice(
      editor.indexOf(">Categories<"),
      editor.indexOf('id={SECTION_DETAILS}'),
    );
    assert.doesNotMatch(categoriesJsx, /border border-line\/70/);
    assert.doesNotMatch(categoriesJsx, /border-terracotta\/40 bg-terracotta\/5/);
  });

  it("keeps Details field keys and subgroup order", () => {
    assert.match(editor, /recipe-section-details/);
    assert.match(editor, /YIELD_KEYS = \["servings", "servingsUnit"\]/);
    assert.match(editor, /TIMING_KEYS = \["prepMinutes", "bakeMinutes", "restMinutes"\]/);
    assert.match(
      editor,
      /CLASSIFICATION_KEYS = \["difficulty", "course", "method", "holiday", "cuisine"\]/,
    );
    assert.match(editor, /TOOLS_KEYS = \["utensils"\]/);
    assert.match(editor, /TAG_KEYS = \["tags"\]/);
    assert.match(editor, /label="Yield"/);
    assert.match(editor, /label="Timing"/);
    assert.match(editor, /label="Classification"/);
    assert.match(editor, /label="Tools"/);
    assert.match(editor, /label="Tags"/);
    assert.match(editor, /layout="yield"/);
    assert.match(editor, /layout="timing"/);
    assert.match(editor, /layout="classification"/);
    assert.match(editor, /max-w-lg grid-cols-1 gap-4 min-\[480px\]:grid-cols-2/);
  });

  it("keeps utensils and tags as canonical string[] with Phase 0 coerce", () => {
    assert.match(utensils, /coerceStringList/);
    assert.match(tags, /coerceStringList/);
    assert.match(editor, /kind === "list"[\s\S]*coerceStringList/);
    assert.deepEqual(coerceStringList([{ name: "whisk" }, { foo: 1 }, "bowl"]), ["whisk", "bowl"]);
    assert.ok(!coerceStringList([{ a: 1 }]).includes("[object Object]"));
    assert.match(utensils, /Add utensil/);
    assert.match(tags, /Improve tags|Suggest tags/);
    assert.match(tags, /Add tag/);
  });

  it("preserves save path, form keys, and Phase 1 chrome contracts", () => {
    assert.match(editor, /action=\{saveRecipeAction\}/);
    assert.match(editor, /name="id"/);
    assert.match(editor, /name="typeId"/);
    assert.match(editor, /name={`field:\$\{field\.key\}`}/);
    assert.match(editor, /name="categoryIds"/);
    assert.match(editor, /attemptUpdateRecipe/);
    assert.match(editor, /EditorStickyActionBar/);
    assert.match(editor, /RecipeEditorSectionNav/);
    assert.match(editor, /AiRecipeAssistant/);
    assert.match(phase1, /Recipe editor Phase 1 presentation contracts/);
  });
});
