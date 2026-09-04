import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
  adminDangerButtonClass,
  adminIconButtonClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTertiaryButtonClass,
} from "./admin-ui";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Admin button system", () => {
  it("defines rectangular primary/secondary geometry without pill radii", () => {
    assert.match(adminPrimaryButtonClass, /bg-terracotta/);
    assert.match(adminPrimaryButtonClass, /rounded-md/);
    assert.match(adminPrimaryButtonClass, /min-h-11/);
    assert.match(adminPrimaryButtonClass, /sm:min-h-10/);
    assert.doesNotMatch(adminPrimaryButtonClass, /rounded-full/);

    assert.match(adminSecondaryButtonClass, /border border-line/);
    assert.match(adminSecondaryButtonClass, /rounded-md/);
    assert.match(adminSecondaryButtonClass, /min-h-11/);
    assert.doesNotMatch(adminSecondaryButtonClass, /rounded-full/);

    assert.match(adminCompactPrimaryButtonClass, /sm:min-h-9/);
    assert.match(adminCompactSecondaryButtonClass, /border border-line/);
    assert.match(adminTertiaryButtonClass, /text-muted/);
    assert.match(adminDangerButtonClass, /text-terracotta/);
    assert.match(adminDangerButtonClass, /hover:bg-terracotta\/5/);
    assert.doesNotMatch(adminDangerButtonClass, /bg-terracotta px|bg-terracotta text-paper/);
    assert.match(adminIconButtonClass, /min-w-11/);
    assert.match(adminPrimaryButtonClass, /disabled:opacity-55/);
  });

  it("wires shared variants on representative admin surfaces", () => {
    const recipesIndex = read("../components/admin/RecipesIndex.tsx");
    const newRecipe = read("../components/admin/NewRecipeButton.tsx");
    const categories = read("../components/admin/CategoriesManager.tsx");
    const seriesIndex = read("../app/admin/(app)/series/page.tsx");
    const seriesEditor = read("../components/admin/SeriesEditor.tsx");
    const seriesOverflow = read("../components/admin/SeriesIndexRowOverflow.tsx");
    const typesForm = read("../components/admin/AddTypeForm.tsx");
    const typeDetails = read("../components/admin/TypeDetailsForm.tsx");
    const typeFields = read("../components/admin/TypeFieldsManager.tsx");
    const typeOverflow = read("../components/admin/DeleteTypeButton.tsx");
    const recipeEditor = read("../components/admin/RecipeEditor.tsx");
    const sticky = read("../components/admin/EditorStickyActionBar.tsx");
    const studio = read("../app/admin/(app)/studio/page.tsx");
    const homepage = read("../components/admin/HomepageCurationForm.tsx");
    const ai = read("../components/admin/AiRecipeAssistant.tsx");
    const seriesAi = read("../components/admin/SeriesEditorialAiControls.tsx");

    assert.match(newRecipe, /adminPrimaryButtonClass/);
    assert.match(recipesIndex, /NewRecipeButton|adminPrimaryButtonClass/);
    assert.match(categories, /adminPrimaryButtonClass/);
    assert.match(categories, /adminSecondaryButtonClass/);
    assert.match(categories, /adminDangerButtonClass/);
    assert.match(seriesIndex, /adminPrimaryButtonClass/);
    assert.match(seriesIndex, /adminSecondaryButtonClass/);
    assert.match(seriesEditor, /adminPrimaryButtonClass/);
    assert.match(seriesEditor, /adminSecondaryButtonClass/);
    assert.match(seriesOverflow, /adminIconButtonClass/);
    assert.match(typesForm, /adminPrimaryButtonClass/);
    assert.match(typeDetails, /adminCompactPrimaryButtonClass/);
    assert.match(typeFields, /adminTertiaryButtonClass/);
    assert.match(typeOverflow, /adminIconButtonClass/);
    assert.match(recipeEditor, /adminCompactPrimaryButtonClass/);
    assert.match(recipeEditor, /adminSecondaryButtonClass/);
    assert.match(sticky, /adminCompactPrimaryButtonClass/);
    assert.match(sticky, /adminCompactSecondaryButtonClass/);
    assert.match(studio, /adminPrimaryButtonClass/);
    assert.match(homepage, /adminPrimaryButtonClass/);
    assert.doesNotMatch(ai, /adminPrimaryButtonClass/);
    assert.match(ai, /adminSecondaryButtonClass/);
    assert.match(seriesAi, /adminSecondaryButtonClass/);
    assert.doesNotMatch(seriesAi, /adminPrimaryButtonClass/);
  });

  it("keeps Recipe Editor and Series sticky Update as primary compact, Preview as secondary", () => {
    const sticky = read("../components/admin/EditorStickyActionBar.tsx");
    const recipeChrome = read("../components/admin/RecipeEditor.tsx");
    assert.match(sticky, /adminCompactSecondaryButtonClass[\s\S]*Preview|Preview[\s\S]*adminCompactSecondaryButtonClass/);
    assert.match(sticky, /adminCompactPrimaryButtonClass/);
    assert.match(recipeChrome, /adminSecondaryButtonClass[\s\S]{0,80}Preview/);
    assert.match(recipeChrome, /adminCompactPrimaryButtonClass/);
  });
});
