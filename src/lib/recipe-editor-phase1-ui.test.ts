import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { confidenceLabel } from "./ai-recipe/types";
import { coerceStringList } from "./coerce-string-list";
import { adminCompactPrimaryButtonClass, adminWorkspaceWide } from "./admin-ui";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
const sectionNav = readFileSync(
  path.join(root, "../components/admin/RecipeEditorSectionNav.tsx"),
  "utf8",
);
const assistant = readFileSync(path.join(root, "../components/admin/AiRecipeAssistant.tsx"), "utf8");
const stickyBar = readFileSync(
  path.join(root, "../components/admin/EditorStickyActionBar.tsx"),
  "utf8",
);
const confidenceBadge = readFileSync(
  path.join(root, "../components/admin/AiConfidenceBadge.tsx"),
  "utf8",
);
const fieldAiButton = readFileSync(
  path.join(root, "../components/admin/FieldAiActionButton.tsx"),
  "utf8",
);
const overflowMenu = readFileSync(
  path.join(root, "../components/admin/FieldOverflowMenu.tsx"),
  "utf8",
);
const utensils = readFileSync(path.join(root, "../components/admin/UtensilsChipEditor.tsx"), "utf8");
const studioTips = readFileSync(
  path.join(root, "../components/admin/StudioTipsCompactEditor.tsx"),
  "utf8",
);

describe("Recipe editor Phase 1 presentation contracts", () => {
  it("keeps editor width, single form, and scroll section IDs", () => {
    assert.equal(adminWorkspaceWide, "max-w-[77.5rem]");
    assert.match(editor, /recipe-section-basics/);
    assert.match(editor, /recipe-section-details/);
    assert.match(editor, /recipe-section-content/);
    assert.match(editor, /recipe-section-media/);
    assert.match(editor, /recipe-section-advanced/);
    assert.match(editor, /action=\{saveRecipeAction\}/);
    assert.match(editor, /<form/);
  });

  it("keeps H1 title, type label, status line, Preview, Update, and overflow", () => {
    assert.match(editor, /<h1 className="[^"]*font-serif/);
    assert.match(editor, /\{typeName\}/);
    assert.match(editor, /documentStateLabel/);
    assert.match(editor, /"Unsaved"/);
    assert.match(editor, /"Saved"/);
    assert.match(editor, /publicationLabel/);
    assert.match(editor, /"Published"/);
    assert.match(editor, /"Draft"/);
    assert.match(editor, /Staff verified/);
    assert.match(editor, />\s*Preview\s*</);
    assert.match(editor, />\s*Update recipe\s*</);
    assert.match(editor, /aria-label="More actions"/);
    assert.match(editor, /Move to draft/);
    assert.match(editor, /Download AI JSON/);
    assert.match(editor, /DeleteRecipeButton/);
    assert.match(editor, /adminCompactPrimaryButtonClass/);
    assert.ok(adminCompactPrimaryButtonClass.includes("rounded-sm"));
    assert.ok(adminCompactPrimaryButtonClass.includes("bg-terracotta"));
  });

  it("keeps sticky header and bottom bar without inventing autosave", () => {
    assert.match(editor, /ref=\{stickyHeaderRef\}/);
    assert.match(editor, /sticky top-0/);
    assert.match(editor, /EditorStickyActionBar/);
    assert.match(stickyBar, /Saved/);
    assert.match(stickyBar, /Unsaved/);
    assert.match(stickyBar, /Published/);
    assert.match(stickyBar, /Draft/);
    assert.match(stickyBar, /Preview/);
    assert.match(stickyBar, /\{publishLabel\}/);
    assert.match(stickyBar, /safe-area-inset-bottom/);
    assert.doesNotMatch(editor, /All changes saved automatically/);
    assert.doesNotMatch(stickyBar, /All changes saved automatically/);
  });

  it("keeps section nav as location links without ARIA tabs", () => {
    assert.match(sectionNav, /aria-label="On this recipe"/);
    assert.match(sectionNav, /aria-current=\{isActive \? "location"/);
    assert.doesNotMatch(sectionNav, /role="tablist"/);
    assert.doesNotMatch(sectionNav, /role="tab"/);
    assert.doesNotMatch(sectionNav, /tabpanel/);
    assert.match(editor, /Basics/);
    assert.match(editor, /Details/);
    assert.match(editor, /Content/);
    assert.match(editor, /Media/);
    assert.match(editor, /Advanced/);
  });

  it("shows review counts as quiet numbers with accessible review meaning", () => {
    assert.match(sectionNav, /fields need review/);
    assert.match(sectionNav, /\{review\}/);
    assert.doesNotMatch(sectionNav, /\{review\} review/i);
    assert.doesNotMatch(sectionNav, /REVIEW/);
    assert.match(sectionNav, /review > 0/);
  });

  it("compacts AI assistant with Fill/Review actions and Advanced disclosure", () => {
    assert.match(assistant, /AI recipe assistant/);
    assert.match(assistant, /Fill missing fields/);
    assert.match(assistant, /Review inferred fields/);
    assert.match(assistant, /<details/);
    assert.match(assistant, /<summary/);
    assert.match(assistant, /Reanalyze full video/);
    assert.match(assistant, /Download AI JSON/);
    assert.match(assistant, /AI-generated recipe information must be reviewed before publishing/);
    assert.match(assistant, /runReanalyzeFullVideo/);
    assert.doesNotMatch(assistant, /<section className="border border-line bg-paper"/);
  });

  it("normalizes provenance labels without pill chrome", () => {
    assert.equal(confidenceLabel("VERIFIED"), "From video");
    assert.equal(confidenceLabel("HIGH_CONFIDENCE_INFERENCE"), "Inferred");
    assert.equal(confidenceLabel("ESTIMATED"), "Estimate — verify");
    assert.match(confidenceBadge, /text-olive/);
    assert.match(confidenceBadge, /text-terracotta/);
    assert.doesNotMatch(confidenceBadge, /rounded-full|bg-olive\/10|px-2 py-0\.5/);
    assert.match(editor, /AiConfidenceBadge/);
  });

  it("keeps Improve quiet but keyboard-reachable, not hover-only", () => {
    assert.match(fieldAiButton, /group-focus-within\/field/);
    assert.match(fieldAiButton, /emphasized/);
    assert.doesNotMatch(fieldAiButton, /hover-only|opacity-0(?! )/);
    assert.match(overflowMenu, /Field actions for \$\{label\}/);
  });

  it("reduces section card cages while keeping structural editors", () => {
    assert.match(editor, /function EditorSection/);
    assert.doesNotMatch(
      editor.slice(editor.indexOf("function EditorSection"), editor.indexOf("function DetailSubgroup")),
      /border border-line bg-paper/,
    );
    assert.match(editor, /InstructionsVideoVerificationLayout/);
    assert.match(editor, /attemptUpdateRecipe/);
  });

  it("preserves Phase 0 plain-list coerce protection", () => {
    assert.deepEqual(coerceStringList([{ name: "whisk", note: "metal" }, "bowl"]), [
      "whisk: metal",
      "bowl",
    ]);
    assert.ok(!coerceStringList([{ foo: 1 }]).includes("[object Object]"));
    assert.match(utensils, /coerceStringList/);
    assert.match(studioTips, /coerceStringList/);
    assert.match(editor, /kind === "list"[\s\S]*coerceStringList/);
    assert.doesNotMatch(utensils, /String\(item\)/);
  });
});
