import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  recipePrimaryCategoryDisplayLabel,
  resolveRecipePrimaryCategorySlug,
} from "./recipe-primary-taxonomy";
import {
  PRODUCTION_RECIPE_TYPE_CORRECTIONS,
  recipeTypeCorrectionForSlug,
} from "./production-recipe-type-corrections";
import { recipes } from "@/data/recipes";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("Recipe editor Recipe Type control", () => {
  it("exposes Recipe type in Basics → Discovery before Featured/Seasonal/Categories", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    const discoveryStart = editor.indexOf(
      '<h3 className="text-sm font-semibold text-ink">Discovery</h3>',
    );
    assert.ok(discoveryStart > 0);
    const block = editor.slice(discoveryStart, discoveryStart + 12000);
    const typePos = block.indexOf('id="recipe-field-typeId"');
    const featuredPos = block.indexOf('name="featured"');
    const seasonalPos = block.indexOf('name="seasonal"');
    const categoriesPos = block.indexOf('<p className="min-w-0 text-sm font-semibold text-ink">Categories</p>');
    assert.ok(typePos > 0, "Recipe type field missing");
    assert.ok(featuredPos > typePos, "Featured should follow Recipe type");
    assert.ok(seasonalPos > featuredPos, "Seasonal should follow Featured");
    assert.ok(categoriesPos > seasonalPos, "Categories should follow Seasonal");
    assert.match(block, /name="typeId"/);
    assert.match(block, /Structural recipe classification/);
    assert.match(editor, /recipeTypes/);
    assert.match(editor, /updateTypeId/);
  });

  it("loads and persists typeId through saveRecipeAction without syncing course/categories", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /formData\.get\("typeId"\)/);
    assert.match(actions, /typeId,/);
    assert.match(actions, /existing\.typeId !== typeId/);
    assert.doesNotMatch(actions, /values\.course\s*=/);
    assert.doesNotMatch(actions, /categoryIds\s*=\s*.*type/i);

    const editPage = read("app/admin/(app)/recipes/[id]/page.tsx");
    assert.match(editPage, /recipeTypes=\{recipeTypes\}/);
    assert.match(editPage, /typeId=\{recipe\.typeId\}/);
    assert.match(editPage, /ensureRecipeTypeCorrections/);
  });

  it("keeps Course and Categories independent from Recipe Type in editor state", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    // Type change updates typeId + aiMeta only — no course/category writes.
    const updateFn = editor.match(/function updateTypeId\(next: string\) \{[\s\S]*?\n  \}/);
    assert.ok(updateFn);
    assert.doesNotMatch(updateFn[0], /setCategoryIds|course|values\.course/);
    assert.match(updateFn[0], /setTypeId\(next\)/);
    assert.match(updateFn[0], /recipeTypeSource: "manual"/);
  });

  it("admin header and list bind to Recipe Type name", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    assert.match(editor, /\{typeName\}/);
    const index = read("components/admin/RecipesIndex.tsx");
    assert.match(index, /recipe\.type\.name/);
  });

  it("corrects Caesar Recipe Type via data correction, not a frontend special-case", () => {
    const taxonomy = read("lib/recipe-primary-taxonomy.ts");
    assert.doesNotMatch(taxonomy, /caesar|Caesar/i);
    assert.ok(recipeTypeCorrectionForSlug("homemade-chicken-caesar-salad-with-garlic-croutons"));
    assert.equal(
      recipeTypeCorrectionForSlug("homemade-chicken-caesar-salad-with-garlic-croutons")?.typeSlug,
      "main",
    );
    assert.ok(
      PRODUCTION_RECIPE_TYPE_CORRECTIONS.every((row) => row.typeSlug === "main" || row.typeSlug),
    );

    const recipesTs = read("lib/recipes.ts");
    assert.match(recipesTs, /ensureRecipeTypeCorrections/);
  });

  it("public card taxonomy follows corrected Recipe Type, not Course alone", () => {
    const base = {
      ...recipes[0],
      title: "Homemade Chicken Caesar Salad with Garlic Croutons",
      course: "Main Course",
      categories: ["main-dishes", "oven", "stovetop"],
    };
    const mistyped = { ...base, typeName: "Condiment" };
    assert.equal(resolveRecipePrimaryCategorySlug(mistyped), "toppings");
    assert.equal(recipePrimaryCategoryDisplayLabel(mistyped), "Condiments");

    const corrected = { ...base, typeName: "Main" };
    assert.equal(resolveRecipePrimaryCategorySlug(corrected), "main-dishes");
    assert.equal(recipePrimaryCategoryDisplayLabel(corrected), "Main Dishes");
  });
});
