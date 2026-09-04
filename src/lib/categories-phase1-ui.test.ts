import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess } from "./admin-access";
import {
  adminWorkspaceCategories,
  adminWorkspaceStandard,
  adminWorkspaceTypes,
  adminWorkspaceWide,
} from "./admin-ui";
import { adminWorkspaceWidthForPath } from "./admin-nav";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/admin/(app)/categories/page.tsx"), "utf8");
const manager = readFileSync(path.join(root, "../components/admin/CategoriesManager.tsx"), "utf8");
const actions = readFileSync(path.join(root, "../app/admin/actions.ts"), "utf8");
const categoryAdmin = readFileSync(path.join(root, "category-admin.ts"), "utf8");

describe("Categories Phase 1 presentation contracts", () => {
  it("uses a Categories-specific workspace width without widening unrelated routes", () => {
    assert.equal(adminWorkspaceCategories, "max-w-5xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/categories"), adminWorkspaceCategories);
    assert.equal(adminWorkspaceWidthForPath("/admin/types"), adminWorkspaceTypes);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/categories"), adminWorkspaceStandard);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/categories"), adminWorkspaceWide);
    assert.equal(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceStandard);
  });

  it("keeps content access for Owner and Editor; Audience denied", () => {
    assert.match(page, /requireAccess\("content"\)/);
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
  });

  it("uses New category disclosure with accessible expand semantics", () => {
    assert.match(manager, /New category/);
    assert.match(manager, /aria-expanded=\{addOpen\}/);
    assert.match(manager, /aria-controls=\{addPanelId\}/);
    assert.match(manager, /Organize the categories used for recipe discovery/);
    assert.match(manager, /action=\{saveCategoryAction\}/);
    assert.match(manager, /name="name"/);
    assert.match(manager, /name="slug"/);
    assert.match(manager, /name="group"/);
    assert.match(manager, /name="description"/);
    assert.match(manager, />\s*Add category\s*</);
    assert.doesNotMatch(manager, /\+\s*Add category/);
    assert.doesNotMatch(manager, /border border-line bg-cream\/30 px-4/);
  });

  it("renders group ledgers without heavy outer cards", () => {
    assert.match(manager, /divide-y divide-line\/80 border-y border-line\/80/);
    assert.match(manager, /\{section\.label\} · \{section\.categories\.length\}/);
    assert.match(manager, /<h2/);
    assert.match(manager, /partitionCategoriesByGroup/);
    assert.doesNotMatch(manager, /ul className="[^"]*border border-line bg-paper/);
    assert.doesNotMatch(manager, /divide-y divide-line border border-line bg-paper/);
  });

  it("keeps accessible Edit names and aria-controls for editors", () => {
    assert.match(manager, /aria-label=\{`Edit \$\{category\.name\}`\}/);
    assert.match(manager, /aria-controls=\{editorPanelId\}/);
    assert.match(manager, /aria-expanded=\{false\}/);
    assert.match(manager, /role="region"/);
    assert.match(manager, /Editing \$\{category\.name\}/);
  });

  it("presents slug as read-only metadata while preserving form contract", () => {
    assert.match(manager, /type="hidden" name="slug"/);
    assert.match(manager, /Set at creation/);
    assert.match(manager, /font-mono text-sm text-muted">\{category\.slug\}/);
    assert.doesNotMatch(
      manager,
      /CategoryEditor[\s\S]*name="slug"[\s\S]*readOnly[\s\S]*adminInputClass/,
    );
  });

  it("ties Save category to existing dirty-state disablement", () => {
    assert.match(manager, /draftsEqual/);
    assert.match(manager, /disabled=\{!isDirty\}/);
    assert.match(manager, /Save category/);
  });

  it("uses conservative 2xl form columns beside the sidebar", () => {
    assert.match(manager, /2xl:grid-cols-2/);
    assert.doesNotMatch(manager, /md:grid-cols-2/);
    assert.match(manager, /min-w-0/);
    assert.match(manager, /min-h-11/);
  });

  it("preserves deletion without recipe-count server gate", () => {
    assert.match(manager, /deleteCategoryAction/);
    assert.match(manager, /recipeCount > 0/);
    assert.match(manager, /will lose this category tag/);
    assert.match(manager, /recipes themselves are not deleted/);
    const deleteBlock = actions.slice(actions.indexOf("export async function deleteCategoryAction"));
    const nextExport = deleteBlock.indexOf("\nexport async function", 1);
    const body = nextExport > 0 ? deleteBlock.slice(0, nextExport) : deleteBlock;
    assert.match(body, /category\.delete/);
    assert.doesNotMatch(body, /recipeCount|_count|inuse|blocked/);
  });

  it("preserves group constants, partition, and save action contracts", () => {
    assert.match(categoryAdmin, /CATEGORY_GROUP_ORDER/);
    assert.match(categoryAdmin, /"desserts", "course", "method", "holiday"/);
    assert.match(manager, /partitionCategoriesByGroup/);
    const saveBlock = actions.slice(actions.indexOf("export async function saveCategoryAction"));
    const nextExport = saveBlock.indexOf("\nexport async function", 1);
    const body = nextExport > 0 ? saveBlock.slice(0, nextExport) : saveBlock;
    assert.match(body, /slug: existing\.slug/);
    assert.match(body, /revalidatePath\("\/admin\/categories"\)/);
    assert.match(body, /#category-\$/);
  });

  it("preserves one-at-a-time inline editing and scroll-on-save", () => {
    assert.match(manager, /expandedId/);
    assert.match(manager, /scrollIntoView/);
    assert.match(manager, /category-\$\{savedCategoryId\}/);
    assert.doesNotMatch(manager, /drawer|Dialog|slide-over/i);
  });
});
