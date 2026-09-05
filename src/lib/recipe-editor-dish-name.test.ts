import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  mergeDishNameIntoValues,
  normalizeDishNameForSave,
  readEditorialDishName,
} from "./recipe-editor-dish-name";
import { resolveRecipeCardTitle } from "./recipe-dish-identity";
import { sectionForFieldKey } from "./recipe-editor-completeness";
import { editorSectionForTypeFieldKey } from "./recipe-type-field-sections";
import { buildRecipeAiFieldRegistry, isRecipeFieldAiSupported } from "./ai-recipe/field-ai-registry";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("Recipe editor dish name", () => {
  it("exposes Dish name in Basics → Identity between Title and Excerpt", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    const identityStart = editor.indexOf('<h3 className="text-sm font-semibold text-ink">Identity</h3>');
    assert.ok(identityStart > 0);
    const identityBlock = editor.slice(identityStart, identityStart + 14000);
    const titlePos = identityBlock.indexOf("Title");
    const dishPos = identityBlock.indexOf(">Dish name<");
    const excerptPos = identityBlock.indexOf(">Excerpt<");
    assert.ok(titlePos > 0 && dishPos > titlePos && excerptPos > dishPos);
    assert.match(
      identityBlock,
      /Short editorial name used on recipe cards and discovery surfaces\. Leave blank to\s+use the recipe title\./,
    );
    assert.match(identityBlock, /id="recipe-field-dishName"/);
    assert.match(identityBlock, /path="values\.dishName"/);
  });

  it("keeps dishName out of Details layout keys and groups it away from specialists", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    assert.match(editor, /ALL_GROUPED = new Set<string>\([\s\S]*?"dishName"/);
    const detailsMatch = editor.match(/const DETAILS_KEYS = \[[\s\S]*?\] as const;/);
    assert.ok(detailsMatch);
    assert.doesNotMatch(detailsMatch[0], /dishName/);
  });

  it("reads legacy aliases and allows blank dish names", () => {
    assert.equal(readEditorialDishName({ dishName: "  Pasta  " }), "Pasta");
    assert.equal(readEditorialDishName({ recipeDish: "Soup" }), "Soup");
    assert.equal(readEditorialDishName({ shortName: "Pie" }), "Pie");
    assert.equal(readEditorialDishName({}), "");
    assert.equal(normalizeDishNameForSave('"  Creamy Pasta  "'), "Creamy Pasta");
    assert.equal(normalizeDishNameForSave('""'), "");
    assert.equal(normalizeDishNameForSave("   "), "");
  });

  it("persists dishName into values without changing title semantics", () => {
    const values: Record<string, unknown> = {
      intro: "Hello",
      dishName: "Old",
    };
    mergeDishNameIntoValues(values, JSON.stringify("Creamy Mushroom Pasta"));
    assert.equal(values.dishName, "Creamy Mushroom Pasta");
    assert.equal(values.intro, "Hello");

    mergeDishNameIntoValues(values, JSON.stringify(""));
    assert.equal(values.dishName, "");
  });

  it("routes dishName to basics for completeness and type ledgers", () => {
    assert.equal(sectionForFieldKey("dishName"), "basics");
    assert.equal(editorSectionForTypeFieldKey("dishName"), "basics");
  });

  it("registers dishName for Field AI / provenance without requiring a type field", () => {
    const registry = buildRecipeAiFieldRegistry([]);
    const def = registry.get("values.dishName");
    assert.ok(def);
    assert.equal(def?.label, "Dish name");
    assert.equal(def?.section, "basics");
    assert.equal(def?.strategy, "gemini_semantic");
    assert.equal(isRecipeFieldAiSupported("values.dishName", []), true);
  });

  it("save path merges field:dishName in saveRecipeAction", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /mergeDishNameIntoValues/);
    assert.match(actions, /field:dishName/);
  });

  it("prefers trustworthy dishName on cards and falls back to title", () => {
    assert.equal(
      resolveRecipeCardTitle({
        title: "I Make This Creamy Mushroom Pasta 3 Times a Week!",
        dishName: "Creamy Mushroom Pasta",
      }),
      "Creamy Mushroom Pasta",
    );
    assert.equal(
      resolveRecipeCardTitle({
        title: "Herb Focaccia",
        dishName: "",
      }),
      "Herb Focaccia",
    );
    assert.equal(
      resolveRecipeCardTitle({
        title: "Herb Focaccia",
        dishName: "Four golden baguettes resting in a cloth-lined basket",
      }),
      "Herb Focaccia",
    );
  });

  it("keeps recipe detail metadata on canonical title while H1 uses dish identity", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    assert.match(page, /title: recipe\.title/);
    assert.match(page, /openGraph:[\s\S]*title: `\$\{recipe\.title\}/);
    assert.doesNotMatch(page, /resolveRecipeCardTitle|resolvePublicRecipeH1/);

    const hero = read("components/RecipePageHero.tsx");
    assert.match(hero, /resolvePublicRecipeH1/);
    assert.match(hero, /resolveRecipeSecondaryDishLine/);
    assert.match(hero, /recipePrimaryCategoryDisplayLabel/);
    assert.doesNotMatch(hero, /\{recipe\.course\}/);
  });
});
