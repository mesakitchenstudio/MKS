import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { coerceStringList } from "./coerce-string-list";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const missingFrame = readFileSync(
  path.join(root, "../components/admin/MissingRequiredFieldFrame.tsx"),
  "utf8",
);

describe("Recipe editor Details field baseline alignment", () => {
  it("uses subgrid alignment for Yield / Timing / Classification rows", () => {
    assert.match(editor, /data-details-align=\{/);
    assert.match(
      editor,
      /min-\[480px\]:\[&>\*\]:row-span-3 min-\[480px\]:\[&>\*\]:grid min-\[480px\]:\[&>\*\]:grid-rows-subgrid/,
    );
    assert.match(
      editor,
      /sm:\[&>\*\]:row-span-4 sm:\[&>\*\]:grid sm:\[&>\*\]:grid-rows-subgrid/,
    );
    assert.match(editor, /data-details-align=\{[\s\S]*layout === "yield"/);
  });

  it("normalizes Yield headers into label + meta slots with provenance off the label line", () => {
    assert.match(editor, /alignSlots=\{alignDetails\}/);
    assert.match(editor, /detailsLayout === "servings"/);
    assert.match(editor, /detailsLayout === "unit"/);
    assert.match(editor, /data-field-slot="label"/);
    assert.match(editor, /data-field-slot="meta"/);
    assert.match(editor, /data-field-slot=\{alignDetails \? "control"/);
    const fieldLabel = editor.slice(editor.indexOf("function FieldLabel"), editor.indexOf("function normalizeStatus"));
    assert.match(fieldLabel, /alignSlots \? \(/);
    assert.match(fieldLabel, /data-field-slot="meta"/);
  });

  it("reserves Timing and Classification helper slots only beside multi-column peers", () => {
    assert.match(editor, /reserveHelper=\{reserveHelper\}/);
    assert.match(
      editor,
      /detailsLayout === "timing" \|\| detailsLayout === "classification"/,
    );
    assert.match(editor, /detailsLayout: "classification"/);
    const fieldLabel = editor.slice(editor.indexOf("function FieldLabel"), editor.indexOf("function normalizeStatus"));
    assert.match(fieldLabel, /hidden sm:block/);
    assert.match(fieldLabel, /data-field-slot="help"/);
    assert.doesNotMatch(fieldLabel, /sm:min-h-\[2/);
  });

  it("keeps mobile free of fixed helper-height spacing and preserves 2xl breakpoints", () => {
    assert.match(editor, /sm:grid-cols-2 2xl:grid-cols-3/);
    assert.match(editor, /max-w-lg grid-cols-1 gap-4 min-\[480px\]:grid-cols-2/);
    const fieldLabel = editor.slice(editor.indexOf("function FieldLabel"), editor.indexOf("function normalizeStatus"));
    assert.doesNotMatch(fieldLabel, /min-h-\[2\.5rem\]|min-h-\[3rem\]|h-\[2\.5rem\]/);
    assert.match(missingFrame, /absolute bottom-2/);
  });

  it("does not alter coerce / yield-timing keys / save contracts", () => {
    assert.ok(!coerceStringList([{ name: "tip" }, { x: 1 }]).includes("[object Object]"));
    assert.match(editor, /YIELD_KEYS = \["servings", "servingsUnit"\]/);
    assert.match(editor, /TIMING_KEYS = \["prepMinutes", "bakeMinutes", "restMinutes"\]/);
    assert.match(
      editor,
      /CLASSIFICATION_KEYS = \["difficulty", "course", "method", "holiday", "cuisine"\]/,
    );
    assert.match(editor, /action=\{saveRecipeAction\}/);
  });
});
