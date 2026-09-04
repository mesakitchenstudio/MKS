import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess } from "./admin-access";
import { adminWorkspaceCategories, adminWorkspaceStandard, adminWorkspaceTypes, adminWorkspaceWide } from "./admin-ui";
import { adminWorkspaceWidthForPath } from "./admin-nav";

const root = path.dirname(fileURLToPath(import.meta.url));
const typesPage = readFileSync(path.join(root, "../app/admin/(app)/types/page.tsx"), "utf8");
const typeDetailPage = readFileSync(path.join(root, "../app/admin/(app)/types/[id]/page.tsx"), "utf8");
const addTypeForm = readFileSync(path.join(root, "../components/admin/AddTypeForm.tsx"), "utf8");
const deleteTypeButton = readFileSync(
  path.join(root, "../components/admin/DeleteTypeButton.tsx"),
  "utf8",
);
const typeDetailsForm = readFileSync(
  path.join(root, "../components/admin/TypeDetailsForm.tsx"),
  "utf8",
);
const typeFieldsManager = readFileSync(
  path.join(root, "../components/admin/TypeFieldsManager.tsx"),
  "utf8",
);

describe("Recipe Types Phase 1 presentation contracts", () => {
  it("uses a Recipe-Types-specific workspace width without widening unrelated routes", () => {
    assert.equal(adminWorkspaceTypes, "max-w-5xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/types"), adminWorkspaceTypes);
    assert.equal(adminWorkspaceWidthForPath("/admin/types/abc"), adminWorkspaceTypes);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/types"), adminWorkspaceStandard);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/types"), adminWorkspaceWide);
    assert.equal(adminWorkspaceWidthForPath("/admin/categories"), adminWorkspaceCategories);
    assert.equal(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceStandard);
  });

  it("keeps content access on index and detail routes", () => {
    assert.match(typesPage, /requireAccess\("content"\)/);
    assert.match(typeDetailPage, /requireAccess\("content"\)/);
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
  });

  it("uses New recipe type disclosure with accessible expand semantics", () => {
    assert.match(addTypeForm, /New recipe type/);
    assert.match(addTypeForm, /aria-expanded=\{open\}/);
    assert.match(addTypeForm, /aria-controls=\{panelId\}/);
    assert.match(addTypeForm, /action=\{saveTypeAction\}/);
    assert.match(addTypeForm, /name="name"/);
    assert.match(addTypeForm, /name="slug"/);
    assert.match(addTypeForm, /name="description"/);
    assert.match(addTypeForm, />\s*Add type\s*</);
    assert.doesNotMatch(addTypeForm, /border border-line bg-paper p-5/);
    assert.doesNotMatch(addTypeForm, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,1\.4fr\)_auto\]/);
  });

  it("renders index as an open hairline ledger with counts and secondary Edit", () => {
    assert.match(addTypeForm, /Templates define which fields are available/);
    assert.match(addTypeForm, /New types begin with Mesa/);
    assert.match(typesPage, /divide-y divide-line\/80 border-y border-line\/80/);
    assert.match(typesPage, /formatTypeLedgerMeta/);
    assert.match(typesPage, /type-specific/);
    assert.match(typesPage, /href=\{`\/admin\/types\/\$\{type\.id\}`\}/);
    assert.match(typesPage, /aria-label=\{`Edit \$\{type\.name\}`\}/);
    assert.match(typesPage, /xl:flex-row xl:items-center/);
    assert.doesNotMatch(typesPage, /border border-line bg-paper/);
    assert.doesNotMatch(typesPage, /A recipe type is the form template/);
  });

  it("keeps zero-recipe delete with overflow menu and clearer confirmation", () => {
    assert.match(deleteTypeButton, /recipeCount > 0/);
    assert.match(deleteTypeButton, /return null/);
    assert.match(deleteTypeButton, /deleteTypeAction/);
    assert.match(deleteTypeButton, /role="menu"/);
    assert.match(deleteTypeButton, /More actions for/);
    assert.match(deleteTypeButton, /currently has no recipes/);
    assert.match(deleteTypeButton, /Other Recipe Types are unaffected/);
    assert.doesNotMatch(deleteTypeButton, /type the type name|type its name/i);
  });

  it("uses a fixed two-slot row action region so Edit stays aligned with or without overflow", () => {
    assert.match(typesPage, /data-mesa-type-row-actions="edit-overflow"/);
    assert.match(typesPage, /grid-cols-\[auto_2\.75rem\]/);
    assert.match(typesPage, /aria-label=\{`Edit \$\{type\.name\}`\}/);
    assert.match(typesPage, /DeleteTypeButton/);
    // Overflow remains gated by recipeCount; no fake menu button when unavailable.
    assert.match(deleteTypeButton, /if \(recipeCount > 0\) \{[\s\S]*?return null/);
    assert.doesNotMatch(deleteTypeButton, /aria-hidden[\s\S]*More actions|More actions[\s\S]*aria-hidden/);
    assert.doesNotMatch(typesPage, /aria-hidden[\s\S]{0,80}More actions|invisible[\s\S]{0,40}⋯/);
  });

  it("de-escalates type details and header chrome on the editor page", () => {
    assert.match(typeDetailPage, /← Recipe types/);
    assert.doesNotMatch(typeDetailPage, /Type template/);
    assert.match(typeDetailPage, /headerMeta/);
    assert.match(typeDetailPage, /type-specific/);
    assert.match(typeDetailsForm, />\s*Details\s*</);
    assert.match(typeDetailsForm, /Save type/);
    assert.match(typeDetailsForm, /action=\{saveTypeAction\}/);
    assert.match(typeDetailsForm, /border-y border-line\/80/);
    assert.doesNotMatch(typeDetailsForm, /border border-line bg-paper p-5/);
  });

  it("uses quiet text filters with counts and keeps client-only filtering", () => {
    assert.match(typeFieldsManager, /Defines field availability and sequence/);
    assert.match(typeFieldsManager, /\{option\.label\} \{count\}/);
    assert.match(typeFieldsManager, /aria-pressed=\{active\}/);
    assert.match(typeFieldsManager, /filterCount\(fields, option\.id\)/);
    assert.match(typeFieldsManager, /matchesFilter/);
    assert.match(typeFieldsManager, /border-b-2/);
    assert.doesNotMatch(typeFieldsManager, /rounded-sm border px-2\.5 py-1/);
    assert.doesNotMatch(typeFieldsManager, /useSearchParams|router\.push/);
  });

  it("emphasizes type-specific only and removes repetitive SHARED ledger copy", () => {
    assert.match(typeFieldsManager, /Type-specific/);
    assert.match(typeFieldsManager, /font-medium text-olive/);
    assert.doesNotMatch(typeFieldsManager, /Used across recipe types/);
    assert.doesNotMatch(typeFieldsManager, />\s*Shared\s*</);
    assert.doesNotMatch(typeFieldsManager, /BREAD-SPECIFIC|typeName\.toUpperCase\(\)/);
  });

  it("hides technical keys by default while keeping them in edit and disclosure", () => {
    assert.match(typeFieldsManager, /Show technical keys/);
    assert.match(typeFieldsManager, /showTechnicalKeys/);
    assert.match(typeFieldsManager, /\{showTechnicalKeys \? \([\s\S]*?field\.key[\s\S]*?\) : null\}/);
    assert.match(typeFieldsManager, /label="Key"/);
    assert.match(typeFieldsManager, /name="key"/);
    assert.match(typeFieldsManager, /useState\(false\)/);
  });

  it("keeps Required visible with stronger treatment", () => {
    assert.match(typeFieldsManager, /font-semibold text-terracotta">Required/);
  });

  it("preserves ↑/↓ moveFieldAction contract and disables reorder when filtered", () => {
    assert.match(typeFieldsManager, /moveFieldAction/);
    assert.match(typeFieldsManager, /direction" value="up"/);
    assert.match(typeFieldsManager, /direction" value="down"/);
    assert.match(typeFieldsManager, /globalIndex === 0/);
    assert.match(typeFieldsManager, /globalIndex === total - 1/);
    assert.match(typeFieldsManager, /reorderDisabled = filter !== "all"/);
    assert.match(typeFieldsManager, /Switch to All to reorder fields/);
    assert.doesNotMatch(typeFieldsManager, /dnd|drag|Drop|sortable/i);
  });

  it("improves type-specific delete confirmation without changing action semantics", () => {
    assert.match(typeFieldsManager, /deleteFieldAction/);
    assert.match(typeFieldsManager, /will no longer appear in the template/);
    assert.match(typeFieldsManager, /may remain stored/);
    assert.doesNotMatch(typeFieldsManager, /Recipe\.values|wipe|migration/i);
  });

  it("keeps Add type-specific field action without AI", () => {
    assert.match(typeFieldsManager, /Add type-specific field/);
    assert.match(typeFieldsManager, /action=\{saveFieldAction\}/);
    assert.doesNotMatch(typeFieldsManager, /✦ Generate|gemini|FieldAi|onRunAi/i);
  });

  it("stacks field and type ledger rows before xl to avoid sidebar overflow", () => {
    assert.match(typesPage, /flex-col[\s\S]*xl:flex-row/);
    assert.match(typeFieldsManager, /flex-col[\s\S]*xl:flex-row xl:items-center/);
    assert.match(typeFieldsManager, /min-h-11/);
    assert.doesNotMatch(typeFieldsManager, /sm:flex-row sm:flex-wrap sm:items-center sm:justify-between/);
  });

  it("keeps Recipe Types index free of field-section grouping chrome", () => {
    assert.doesNotMatch(typesPage, /FieldSectionMarker|annotateTypeFieldSectionRuns/);
    assert.doesNotMatch(addTypeForm, /TYPE_FIELD_SECTION_LABELS|editorSectionForTypeFieldKey/);
    assert.doesNotMatch(typeDetailPage, /Basics \/ Details \/ Content/);
  });
});
