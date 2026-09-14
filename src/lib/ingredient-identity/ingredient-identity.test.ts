import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { recipes } from "@/data/recipes";
import {
  analyzeIngredientCorpus,
  assertValidIngredientSeed,
  buildIngredientCatalog,
  formatIngredientCorpusReport,
  INGREDIENT_IDENTITY_SEED,
  matchIngredientIdentity,
  matchIngredientIdentityAgainstCatalog,
  normalizeIngredientLookupKey,
  validateIngredientSeed,
} from "@/lib/ingredient-identity";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("ING-1 normalizeIngredientLookupKey", () => {
  it("trims, lowercases, collapses whitespace, and NFKC-normalizes", () => {
    assert.equal(normalizeIngredientLookupKey(" Eggs "), "eggs");
    assert.equal(normalizeIngredientLookupKey("LARGE   EGGS"), "large eggs");
    // Compatibility decomposition: fullwidth Latin → ASCII
    assert.equal(normalizeIngredientLookupKey("ＥＧＧＳ"), "eggs");
  });

  it("normalizes typographic apostrophes and dashes safely", () => {
    assert.equal(normalizeIngredientLookupKey("baker\u2019s yeast"), "baker's yeast");
    assert.equal(normalizeIngredientLookupKey("all\u2013purpose flour"), "all-purpose flour");
  });

  it("preserves meaningful internal words and hyphens", () => {
    assert.equal(normalizeIngredientLookupKey("all-purpose flour"), "all-purpose flour");
    assert.equal(normalizeIngredientLookupKey("cream cheese"), "cream cheese");
    assert.equal(normalizeIngredientLookupKey("eggplant"), "eggplant");
  });

  it("does not stem plurals or strip culinary descriptors", () => {
    assert.equal(normalizeIngredientLookupKey("berries"), "berries");
    assert.equal(normalizeIngredientLookupKey("cheese"), "cheese");
    assert.equal(normalizeIngredientLookupKey("cold unsalted butter"), "cold unsalted butter");
    assert.equal(normalizeIngredientLookupKey("red bell pepper"), "red bell pepper");
  });

  it("strips only harmless surrounding punctuation", () => {
    assert.equal(normalizeIngredientLookupKey("eggs,"), "eggs");
    assert.equal(normalizeIngredientLookupKey('"eggs"'), "eggs");
  });
});

describe("ING-1 matchIngredientIdentity", () => {
  const catalog = buildIngredientCatalog(INGREDIENT_IDENTITY_SEED);

  it("matches alias before resolving unresolved", () => {
    const largeEggs = matchIngredientIdentityAgainstCatalog("Large Eggs", catalog);
    assert.equal(largeEggs.status, "alias");
    assert.equal(largeEggs.ingredientName, "Egg");
    assert.equal(largeEggs.normalizedInput, "large eggs");
  });

  it("matches exact canonical nameNorm", () => {
    const egg = matchIngredientIdentityAgainstCatalog("Egg", catalog);
    assert.equal(egg.status, "exact");
    assert.equal(egg.ingredientName, "Egg");
  });

  it("keeps Egg yolk / Egg white separate from Egg", () => {
    assert.equal(matchIngredientIdentityAgainstCatalog("egg yolks", catalog).ingredientName, "Egg yolk");
    assert.equal(matchIngredientIdentityAgainstCatalog("egg whites", catalog).ingredientName, "Egg white");
    assert.equal(matchIngredientIdentityAgainstCatalog("eggs", catalog).ingredientName, "Egg");
  });

  it("does not fuzzy or substring match cream ↔ cream cheese or egg ↔ eggplant", () => {
    assert.equal(matchIngredientIdentityAgainstCatalog("cream cheese", catalog).ingredientName, "Cream cheese");
    assert.equal(matchIngredientIdentityAgainstCatalog("cream", catalog).ingredientName, "Cream");
    assert.equal(matchIngredientIdentityAgainstCatalog("eggplant", catalog).status, "unresolved");
    assert.notEqual(matchIngredientIdentityAgainstCatalog("eggplant", catalog).ingredientName, "Egg");
  });

  it("treats unresolved as first-class success (not an error)", () => {
    const mystery = matchIngredientIdentityAgainstCatalog(
      "vanilla-flavoured pudding powder",
      catalog,
    );
    assert.equal(mystery.status, "unresolved");
    assert.equal(mystery.ingredientId, undefined);
    assert.ok(mystery.normalizedInput.includes("vanilla"));
  });

  it("documents alias-before-canonical order with an explicit collision fixture", () => {
    const ingredients = [
      { id: "ing:special", name: "Special", nameNorm: "special blend" },
      { id: "ing:blend", name: "Blend", nameNorm: "blend" },
    ];
    const aliases = [
      { ingredientId: "ing:blend", alias: "special blend", aliasNorm: "special blend" },
    ];
    const result = matchIngredientIdentity({
      authoredItem: "Special Blend",
      ingredients,
      aliases,
    });
    // Alias wins when both could apply.
    assert.equal(result.status, "alias");
    assert.equal(result.ingredientId, "ing:blend");
  });
});

describe("ING-1 seed validation", () => {
  it("accepts the curated developmental seed", () => {
    assert.deepEqual(validateIngredientSeed(INGREDIENT_IDENTITY_SEED), []);
    assert.doesNotThrow(() => assertValidIngredientSeed(INGREDIENT_IDENTITY_SEED));
  });

  it("detects duplicate canonical nameNorm", () => {
    const issues = validateIngredientSeed([
      { name: "Egg" },
      { name: " egg " },
    ]);
    assert.ok(issues.some((issue) => issue.kind === "duplicate_name_norm"));
  });

  it("detects duplicate aliasNorm across ingredients", () => {
    const issues = validateIngredientSeed([
      { name: "Egg", aliases: ["large eggs"] },
      { name: "Egg yolk", aliases: ["large eggs"] },
    ]);
    assert.ok(issues.some((issue) => issue.kind === "duplicate_alias_norm"));
  });

  it("detects alias colliding with another canonical nameNorm", () => {
    const issues = validateIngredientSeed([
      { name: "Egg" },
      { name: "Butter", aliases: ["egg"] },
    ]);
    assert.ok(issues.some((issue) => issue.kind === "alias_collides_with_other_canonical"));
  });
});

describe("ING-1 corpus analysis", () => {
  it("analyzes static recipe catalog without mutating authored items", () => {
    const snapshot = JSON.stringify(recipes.map((r) => r.ingredients));
    const report = analyzeIngredientCorpus({
      recipes: recipes.map((recipe) => ({
        title: recipe.title,
        ingredients: recipe.ingredients,
      })),
    });
    assert.equal(JSON.stringify(recipes.map((r) => r.ingredients)), snapshot);
    assert.ok(report.recipesAnalyzed >= 1);
    assert.ok(report.ingredientRows >= 1);
    assert.ok(report.distinctAuthoredItems >= 1);
    assert.equal(report.matchedExact + report.matchedAlias, report.matchedDistinct);
    assert.equal(report.matchedDistinct + report.unresolved, report.distinctAuthoredItems);
    assert.match(formatIngredientCorpusReport(report), /Ingredient normalization report/);
    assert.match(formatIngredientCorpusReport(report), /Unresolved:/);
  });

  it("counts exact and alias matches for known fixtures", () => {
    const report = analyzeIngredientCorpus({
      recipes: [
        {
          title: "Test",
          ingredients: [
            {
              items: [
                { item: "Large Eggs", amount: "2" },
                { item: "Egg", amount: "1" },
                { item: "mystery spice blend", amount: "1 tsp" },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(report.ingredientRows, 3);
    assert.equal(report.matchedAlias, 1);
    assert.equal(report.matchedExact, 1);
    assert.equal(report.unresolved, 1);
  });
});

describe("ING-1 isolation from Recipe behavior", () => {
  it("does not alter ingredient-groups or culinary-format modules", () => {
    const groups = readFileSync(path.join(root, "../ingredient-groups.ts"), "utf8");
    const culinary = readFileSync(path.join(root, "../culinary-format.ts"), "utf8");
    assert.doesNotMatch(groups, /ingredient-identity|normalizeIngredientLookupKey/);
    assert.doesNotMatch(culinary, /ingredient-identity|normalizeIngredientLookupKey/);
  });

  it("documents that Ingredient persistence models exist for ING-2+", () => {
    const schema = readFileSync(path.join(root, "../../../prisma/schema.prisma"), "utf8");
    assert.match(schema, /model Ingredient\b/);
    assert.match(schema, /model IngredientAlias\b/);
    assert.match(schema, /model RecipeIngredient\b/);
    assert.match(schema, /Authored source of truth remains Recipe\.values\.ingredients/);
  });
});
