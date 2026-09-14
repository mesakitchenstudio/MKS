import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildIngredientCreateFields,
  ingredientSlugFromName,
  INGREDIENT_MATCH_VIA,
  isIngredientMatchVia,
} from "./persistence";

const root = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(root, "../../../prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(
    root,
    "../../../prisma/migrations/20260914012000_ingredient_identity_foundation/migration.sql",
  ),
  "utf8",
);

describe("ING-2 Prisma schema contracts", () => {
  it("defines Ingredient with unique nameNorm and slug", () => {
    assert.match(schema, /model Ingredient \{/);
    assert.match(schema, /nameNorm\s+String\s+@unique/);
    assert.match(schema, /slug\s+String\s+@unique/);
    assert.match(schema, /createdAt\s+DateTime\s+@default\(now\(\)\)/);
    assert.match(schema, /updatedAt\s+DateTime\s+@updatedAt/);
  });

  it("defines IngredientAlias with unique aliasNorm and cascade delete", () => {
    assert.match(schema, /model IngredientAlias \{/);
    assert.match(schema, /aliasNorm\s+String\s+@unique/);
    assert.match(
      schema,
      /ingredient\s+Ingredient\s+@relation\(fields: \[ingredientId\], references: \[id\], onDelete: Cascade\)/,
    );
  });

  it("defines RecipeIngredient as derived index with nullable ingredientId", () => {
    assert.match(schema, /model RecipeIngredient \{/);
    assert.match(schema, /ingredientId\s+String\?/);
    assert.match(schema, /authoredItem\s+String/);
    assert.match(schema, /authoredItemNorm\s+String/);
    assert.match(schema, /matchedVia\s+String\s+@default\("UNRESOLVED"\)/);
    assert.match(schema, /@@unique\(\[recipeId, groupIndex, itemIndex\]\)/);
    assert.match(
      schema,
      /recipe\s+Recipe\s+@relation\(fields: \[recipeId\], references: \[id\], onDelete: Cascade\)/,
    );
    assert.match(
      schema,
      /ingredient\s+Ingredient\?\s+@relation\(fields: \[ingredientId\], references: \[id\], onDelete: Restrict\)/,
    );
    assert.match(schema, /@@index\(\[matchedVia, authoredItemNorm\]\)/);
    assert.match(schema, /@@index\(\[ingredientId, recipeId\]\)/);
  });

  it("wires Recipe.recipeIngredients without changing values ownership comments", () => {
    assert.match(schema, /recipeIngredients RecipeIngredient\[\]/);
    assert.match(schema, /Authored source of truth remains Recipe\.values\.ingredients/);
    assert.doesNotMatch(schema, /enum IngredientMatch/);
  });

  it("migration is additive Postgres DDL only", () => {
    assert.match(migration, /CREATE TABLE "Ingredient"/);
    assert.match(migration, /CREATE TABLE "IngredientAlias"/);
    assert.match(migration, /CREATE TABLE "RecipeIngredient"/);
    assert.match(migration, /ON DELETE CASCADE/);
    assert.match(migration, /ON DELETE RESTRICT/);
    assert.doesNotMatch(migration, /ALTER TABLE "Recipe"/);
    assert.doesNotMatch(migration, /UPDATE\s+"Recipe"/i);
    assert.doesNotMatch(migration, /INSERT INTO "Ingredient"/);
    assert.doesNotMatch(migration, /INSERT INTO "RecipeIngredient"/);
    assert.match(migration, /Does not alter Recipe\.values/);
  });
});

describe("ING-2 persistence helpers", () => {
  it("builds slug/nameNorm from shared slugify + ING-1 normalizer", () => {
    const fields = buildIngredientCreateFields("  Egg Yolk ");
    assert.equal(fields.name, "Egg Yolk");
    assert.equal(fields.nameNorm, "egg yolk");
    assert.equal(fields.slug, "egg-yolk");
    assert.equal(ingredientSlugFromName("All-purpose flour"), "all-purpose-flour");
  });

  it("recognizes matchedVia vocabulary", () => {
    assert.equal(isIngredientMatchVia(INGREDIENT_MATCH_VIA.EXACT), true);
    assert.equal(isIngredientMatchVia(INGREDIENT_MATCH_VIA.ALIAS), true);
    assert.equal(isIngredientMatchVia(INGREDIENT_MATCH_VIA.UNRESOLVED), true);
    assert.equal(isIngredientMatchVia("FUZZY"), false);
  });
});
