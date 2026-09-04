import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { coerceStringList } from "./coerce-string-list";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const layout = readFileSync(
  path.join(root, "../components/admin/InstructionsVideoVerificationLayout.tsx"),
  "utf8",
);
const videoWorkspace = readFileSync(
  path.join(root, "../components/admin/InstructionVideoWorkspace.tsx"),
  "utf8",
);
const shell = readFileSync(path.join(root, "../components/admin/AdminShell.tsx"), "utf8");

describe("Recipe editor sidebar-aware responsive QA", () => {
  it("defers instruction video side rail and sticky to 2xl", () => {
    assert.match(layout, /2xl:flex-row/);
    assert.match(layout, /2xl:flex-\[0_1_32%\]/);
    assert.match(layout, /2xl:flex-\[1_1_68%\]/);
    assert.match(videoWorkspace, /2xl:sticky/);
    assert.doesNotMatch(layout, /\bxl:flex-row\b/);
    assert.doesNotMatch(videoWorkspace, /\bxl:sticky\b/);
  });

  it("defers ingredient desktop 5-column row to 2xl and keeps tablet Notes on row 2", () => {
    const ingredients = editor.slice(
      editor.indexOf("function IngredientsEditor"),
      editor.indexOf("function ImageField"),
    );
    assert.match(
      ingredients,
      /md:grid-cols-\[1\.75rem_minmax\(5rem,6\.5rem\)_minmax\(0,1fr\)_2\.5rem\]/,
    );
    assert.match(
      ingredients,
      /2xl:grid-cols-\[1\.75rem_minmax\(6\.5rem,8\.5rem\)_minmax\(0,1\.4fr\)_minmax\(12rem,20rem\)_auto\]/,
    );
    assert.match(ingredients, /md:col-span-3 md:col-start-2 2xl:col-span-1 2xl:col-start-4/);
    assert.match(ingredients, /md:col-start-4 md:row-start-1 2xl:col-start-5/);
    assert.match(ingredients, /min-w-0/);
    assert.doesNotMatch(ingredients, /\bxl:grid-cols-/);
  });

  it("defers Details 3-column layouts past sidebar-constrained tablet widths", () => {
    assert.match(editor, /layout === "timing"[\s\S]*2xl:grid-cols-3/);
    assert.match(editor, /layout === "classification"[\s\S]*2xl:grid-cols-3/);
    assert.doesNotMatch(editor, /layout === "timing"[\s\S]*?\bxl:grid-cols-3/);
    assert.doesNotMatch(editor, /layout === "classification"[\s\S]*?\blg:grid-cols-3/);
    assert.match(editor, /max-w-lg grid-cols-1 gap-4 min-\[480px\]:grid-cols-2/);
  });

  it("keeps field meta and category choices able to wrap inside the editor width", () => {
    assert.match(editor, /flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1\.5/);
    assert.match(editor, /min-w-0 max-w-full items-start gap-2/);
    assert.match(editor, /min-w-0 break-words/);
    assert.match(shell, /main className="min-w-0 flex-1"/);
    assert.match(shell, /min-w-0 w-full/);
  });

  it("does not change coerce / save / instructions behavior contracts", () => {
    assert.ok(!coerceStringList([{ name: "tip" }, { x: 1 }]).includes("[object Object]"));
    assert.match(editor, /action=\{saveRecipeAction\}/);
    assert.match(editor, /InstructionsVideoVerificationLayout/);
    assert.match(layout, /onSetStartFromPlayhead/);
    assert.match(layout, /onSetEndFromPlayhead/);
  });
});
