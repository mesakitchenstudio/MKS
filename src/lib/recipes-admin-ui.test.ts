import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess, homeForRole } from "./admin-access";
import { adminWorkspaceRecipes, adminWorkspaceWide } from "./admin-ui";
import { adminWorkspaceWidthForPath } from "./admin-nav";
import { formatAdminDateTime, formatAdminDateTimeUtc } from "./datetime";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/admin/(app)/page.tsx"), "utf8");
const index = readFileSync(path.join(root, "../components/admin/RecipesIndex.tsx"), "utf8");
const newRecipe = readFileSync(path.join(root, "../components/admin/NewRecipeButton.tsx"), "utf8");

describe("Recipes admin index UI contracts", () => {
  it("keeps /admin route, content access, and Recipes-specific workspace width", () => {
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /orderBy:\s*\{\s*updatedAt:\s*"desc"\s*\}/);
    assert.doesNotMatch(page, /take:\s*\d+/);
    assert.equal(adminWorkspaceRecipes, "max-w-[70rem]");
    assert.equal(adminWorkspaceWidthForPath("/admin"), adminWorkspaceRecipes);
    assert.notEqual(adminWorkspaceWidthForPath("/admin"), adminWorkspaceWide);
    assert.equal(adminWorkspaceWidthForPath("/admin/recipes/abc"), adminWorkspaceWide);
    assert.equal(adminWorkspaceWide, "max-w-[77.5rem]");
  });

  it("uses H1 Recipes without procedural draft sentence", () => {
    assert.match(index, /<h1[\s\S]*>\s*Recipes\s*</);
    assert.doesNotMatch(index, /Drafts stay off the public site/);
  });

  it("keeps global catalog counts separate from filtered Showing X of Y", () => {
    assert.match(index, /recipeCounts\(recipes\)/);
    assert.match(index, /Showing \{filtered\.length\} of \{recipes\.length\}/);
    assert.match(index, /hasActiveFilters/);
    assert.match(index, /Clear filters/);
  });

  it("places New recipe in the header without a leading plus", () => {
    assert.match(index, /<header[\s\S]*NewRecipeButton/);
    assert.match(newRecipe, />\s*New recipe\s*</);
    assert.doesNotMatch(newRecipe, /\+\s*New recipe/);
  });

  it("preserves New recipe create destinations", () => {
    assert.match(newRecipe, /href="\/admin\/types"/);
    assert.match(newRecipe, /href=\{`\/admin\/recipes\/new\?type=\$\{types\[0\]\.id\}`\}/);
    assert.match(newRecipe, /href=\{`\/admin\/recipes\/new\?type=\$\{type\.id\}`\}/);
    assert.match(newRecipe, /role="menu"/);
  });

  it("keeps title-only client search and AND filters", () => {
    assert.match(index, /recipe\.title\.toLowerCase\(\)\.includes\(q\)/);
    assert.doesNotMatch(index, /recipe\.slug\.toLowerCase/);
    assert.match(index, /recipe\.type\.id !== typeId/);
    assert.match(index, /normalizeStatus\(recipe\.status\) !== status/);
    assert.match(index, /StatusFilter = "all" \| "published" \| "draft"/);
  });

  it("uses quiet inline status controls without inventing states", () => {
    assert.match(index, /aria-label="Filter by status"/);
    assert.match(index, /\["all", "All"\]/);
    assert.match(index, /\["published", "Published"\]/);
    assert.match(index, /\["draft", "Draft"\]/);
    assert.doesNotMatch(index, /archived|scheduled|pending/);
    assert.doesNotMatch(index, /id="recipe-status-filter"/);
  });

  it("keeps RecipeType select and no Categories column", () => {
    assert.match(index, /id="recipe-type-filter"/);
    assert.match(index, /All types/);
    assert.match(index, />\s*Type\s*</);
    assert.doesNotMatch(index, />\s*Categor/);
  });

  it("keeps semantic desktop table with editor title link and Edit", () => {
    assert.match(index, /<table/);
    assert.match(index, /scope="col"/);
    assert.match(index, /sr-only">Actions</);
    assert.match(index, /href=\{`\/admin\/recipes\/\$\{recipe\.id\}`\}/);
    assert.match(index, /aria-label=\{`Edit \$\{recipe\.title\}`\}/);
    assert.match(index, /line-clamp-2/);
  });

  it("publishes View in a new tab and omits View for drafts", () => {
    assert.match(index, /href=\{`\/recipes\/\$\{recipe\.slug\}`\}/);
    assert.match(index, /target="_blank"/);
    assert.match(index, /rel="noopener noreferrer"/);
    assert.match(index, /View ↗/);
    assert.match(index, /View \$\{recipe\.title\} on public site \(opens in new tab\)/);
    assert.match(index, /\{published \? \([\s\S]*View ↗[\s\S]*\) : null\}/);
  });

  it("uses text-only status without decorative dots", () => {
    assert.match(index, /Published/);
    assert.match(index, /Draft/);
    assert.match(index, /text-olive/);
    assert.match(index, /text-terracotta/);
    assert.doesNotMatch(index, /rounded-full[\s\S]*bg-olive/);
    assert.doesNotMatch(index, /aria-hidden[\s\S]*h-1\.5 w-1\.5/);
  });

  it("shows UTC times without per-row GMT and notes Times in GMT once per layout", () => {
    assert.match(index, /formatAdminDateTimeUtc/);
    assert.doesNotMatch(index, /formatAdminDateTime\(/);
    assert.match(index, /Times in GMT/);
    assert.equal(
      formatAdminDateTimeUtc("2026-09-02T18:20:00.000Z"),
      "Sep 2, 2026 · 6:20 PM",
    );
    assert.equal(
      formatAdminDateTime("2026-09-02T18:20:00.000Z"),
      "Sep 2, 2026 · 6:20 PM GMT",
    );
  });

  it("has no bulk controls, delete, sort, or thumbnails on the list", () => {
    assert.doesNotMatch(index, /checkbox|bulk|Delete|sortKey|thumbnail|img /i);
    assert.doesNotMatch(index, /deleteRecipeAction|DeleteRecipeButton/);
  });

  it("uses compact mobile list rows without card cages", () => {
    assert.match(index, /md:hidden/);
    assert.match(index, /divide-y divide-line\/70/);
    assert.doesNotMatch(index, /space-y-3 md:hidden/);
  });

  it("preserves Owner/Editor content access and Audience denial", () => {
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
    assert.equal(homeForRole("owner"), "/admin");
    assert.equal(homeForRole("editor"), "/admin");
    assert.equal(homeForRole("members"), "/admin/members");
  });

  it("removes the search/filter outer cage", () => {
    assert.doesNotMatch(
      index,
      /rounded-sm border border-line bg-paper p-3[\s\S]*role="search"/,
    );
    assert.doesNotMatch(
      index,
      /role="search"[\s\S]*rounded-sm border border-line bg-paper p-3/,
    );
  });
});
