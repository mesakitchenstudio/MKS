import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { coerceStringList } from "./coerce-string-list";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const utensils = readFileSync(path.join(root, "../components/admin/UtensilsChipEditor.tsx"), "utf8");
const tips = readFileSync(path.join(root, "../components/admin/StudioTipsCompactEditor.tsx"), "utf8");
const keyIngredients = readFileSync(
  path.join(root, "../components/admin/KeyIngredientsCompactEditor.tsx"),
  "utf8",
);
const faq = readFileSync(path.join(root, "../components/admin/FaqAccordionEditor.tsx"), "utf8");
const instructionsLayout = readFileSync(
  path.join(root, "../components/admin/InstructionsVideoVerificationLayout.tsx"),
  "utf8",
);

describe("Recipe editor Phase 3 Content contracts", () => {
  it("keeps prose fields in Content with editorial measure", () => {
    assert.match(editor, /CONTENT_KEYS = \[[\s\S]*"intro"[\s\S]*"whyItWorks"/);
    assert.match(editor, /max-w-\[72ch\]/);
    assert.match(editor, /fieldKey === "intro" \|\| fieldKey === "whyItWorks"/);
    assert.match(editor, /The story, ingredients, and method/);
    assert.match(editor, /recipe-section-content/);
  });

  it("preserves ingredient structure, actions, and distinct AI subfield targets", () => {
    assert.match(editor, /function IngredientsEditor/);
    assert.match(editor, /\+ Add ingredient/);
    assert.match(editor, /\+ Add group/);
    assert.match(editor, /\.items\.\$\{itemIndex\}\.amount/);
    assert.match(editor, /\.items\.\$\{itemIndex\}\.item/);
    assert.match(editor, /\.items\.\$\{itemIndex\}\.notes/);
    assert.match(editor, /EditorDragHandle/);
    assert.match(editor, /moveArrayItem\(group\.items/);
    assert.match(editor, /aiSlot\(amountPath/);
    assert.match(editor, /aiSlot\(itemPath/);
    assert.match(editor, /aiSlot\(notesPath/);
    assert.match(editor, /reviewPaths\.has\(path\)/);
  });

  it("keeps Notes/Tips as string[] and Key ingredients/FAQ as namedNotes", () => {
    assert.match(editor, /fieldKey === "tips"/);
    assert.match(editor, /StudioTipsCompactEditor/);
    assert.match(editor, /coerceStringList/);
    assert.match(tips, /coerceStringList/);
    assert.match(editor, /fieldKey === "keyIngredients"/);
    assert.match(editor, /KeyIngredientsCompactEditor/);
    assert.match(editor, /fieldKey === "faqs"/);
    assert.match(editor, /FaqAccordionEditor/);
    assert.match(keyIngredients, /\{ name: "", note: "" \}/);
    assert.match(faq, /\{ name: "", note: "" \}/);
    assert.doesNotMatch(keyIngredients, /coerceStringList/);
    assert.doesNotMatch(faq, /coerceStringList/);
    assert.ok(!coerceStringList([{ name: "tip" }, { x: 1 }]).includes("[object Object]"));
    assert.match(tips, /\+ Add tip/);
    assert.match(keyIngredients, /\+ Add item/);
    assert.match(faq, /\+ Add question/);
    assert.match(keyIngredients, /No key ingredients yet/);
    assert.match(faq, /No questions yet/);
  });

  it("does not redesign Instructions / chapter tooling in Phase 3", () => {
    assert.match(editor, /InstructionsVideoVerificationLayout/);
    assert.match(instructionsLayout, /Suggest timestamps|chapter|YouTube/i);
    const phase3ContentSlice = editor.slice(
      editor.indexOf("function IngredientsEditor"),
      editor.indexOf("function ImageField"),
    );
    assert.doesNotMatch(phase3ContentSlice, /Suggest timestamps/);
    assert.doesNotMatch(phase3ContentSlice, /InstructionsAccordionEditor/);
  });

  it("preserves Phase 0 utensil/notes/tips coerce protection", () => {
    assert.match(utensils, /coerceStringList/);
    assert.match(tips, /coerceStringList/);
    assert.match(editor, /kind === "list"[\s\S]*coerceStringList/);
    assert.deepEqual(coerceStringList(["a", { text: "b" }, { foo: 1 }]), ["a", "b"]);
  });
});
