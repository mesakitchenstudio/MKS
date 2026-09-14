import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("ING-3 write-path wiring contracts", () => {
  it("hooks rebuild into saveRecipeAction transaction", () => {
    const source = readFileSync(path.join(root, "../../app/admin/actions.ts"), "utf8");
    assert.match(source, /rebuildRecipeIngredientIndex/);
    assert.match(source, /await rebuildRecipeIngredientIndex\(tx,/);
  });

  it("hooks rebuild into revision restore transaction", () => {
    const source = readFileSync(path.join(root, "../recipe-revisions.ts"), "utf8");
    assert.match(source, /rebuildRecipeIngredientIndex/);
    assert.match(source, /await rebuildRecipeIngredientIndex\(tx,/);
  });

  it("hooks rebuild into YouTube AI populate path", () => {
    const source = readFileSync(
      path.join(root, "../youtube-data/create-recipe-from-video.ts"),
      "utf8",
    );
    assert.match(source, /rebuildRecipeIngredientIndex/);
    assert.ok(
      (source.match(/rebuildRecipeIngredientIndex/g) || []).length >= 2,
      "create + AI populate should both rebuild",
    );
  });

  it("does not change public q= search to use RecipeIngredient", () => {
    const discovery = readFileSync(path.join(root, "../recipe-discovery.ts"), "utf8");
    assert.doesNotMatch(discovery, /recipeIngredient|RecipeIngredient/);
  });

  it("keeps corpus CLI read-only / seed-based", () => {
    const corpus = readFileSync(
      path.join(root, "../../../scripts/analyze-ingredient-corpus.ts"),
      "utf8",
    );
    assert.doesNotMatch(corpus, /seedIngredientIdentity|backfillRecipeIngredientIndex|getDb/);
  });
});
