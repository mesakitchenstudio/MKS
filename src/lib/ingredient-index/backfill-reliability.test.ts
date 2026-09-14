import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getDb } from "@/lib/db";
import {
  RECIPE_INGREDIENT_BACKFILL_TX,
  backfillRecipeIngredientIndex,
  isTransientIngredientBackfillError,
  prepareRecipeIngredientIndexRows,
  rebuildRecipeIngredientIndex,
  replaceRecipeIngredientIndexRows,
} from "@/lib/ingredient-index";

const root = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = `bf-rel-${Date.now()}-`;

function readBackfillSource() {
  return readFileSync(path.join(root, "backfill.ts"), "utf8");
}

describe("ingredient backfill reliability", () => {
  it("A: transaction timeout configured above Prisma default 5000ms", () => {
    assert.equal(RECIPE_INGREDIENT_BACKFILL_TX.timeout, 30_000);
    assert.ok(RECIPE_INGREDIENT_BACKFILL_TX.timeout > 5_000);
    assert.equal(RECIPE_INGREDIENT_BACKFILL_TX.maxWait, 10_000);
    const source = readBackfillSource();
    assert.match(source, /timeout:\s*RECIPE_INGREDIENT_BACKFILL_TX\.timeout/);
    assert.match(source, /maxWait:\s*RECIPE_INGREDIENT_BACKFILL_TX\.maxWait/);
  });

  it("B: prepare (catalog/lookup) is outside the interactive transaction", () => {
    const source = readBackfillSource();
    assert.match(source, /prepareRecipeIngredientIndexRows\(db,/);
    assert.match(source, /replaceRecipeIngredientIndexRows\(tx,/);
    // Catalog load must not sit only inside $transaction callback.
    const txBlock = source.slice(source.indexOf("$transaction"));
    assert.doesNotMatch(
      txBlock.slice(0, 400),
      /prepareRecipeIngredientIndexRows\(tx/,
    );
  });

  it("E/F: transient timeout retries once; non-transient does not", () => {
    assert.equal(
      isTransientIngredientBackfillError(
        new Error("Transaction already closed: A batch query cannot be executed on an expired transaction."),
      ),
      true,
    );
    assert.equal(
      isTransientIngredientBackfillError(
        Object.assign(new Error("tx timeout"), { code: "P2028" }),
      ),
      true,
    );
    assert.equal(
      isTransientIngredientBackfillError(
        new Error("Can't reach database server at ep-example.neon.tech:5432"),
      ),
      true,
    );
    assert.equal(
      isTransientIngredientBackfillError(new Error("Alias ownership conflict")),
      false,
    );
    assert.equal(
      isTransientIngredientBackfillError(new Error("RecipeIngredient invariant violated")),
      false,
    );

    const source = readBackfillSource();
    assert.match(source, /attempt < 2/);
    assert.match(source, /isTransientIngredientBackfillError/);
  });

  it("C/D/G/H/I: atomic replace, rerun, values unchanged, dry-run non-mutating", async (t) => {
    const db = getDb();
    let available = true;
    try {
      await db.ingredient.count();
      await db.recipeIngredient.count();
    } catch {
      available = false;
    }
    if (!available) return t.skip("Ingredient tables missing");

    const type =
      (await db.recipeType.findFirst({ select: { id: true } })) ??
      (await db.recipeType.create({
        data: { name: `${PREFIX}type`, slug: `${PREFIX}type`, description: "" },
      }));

    const values = JSON.stringify({
      ingredients: [{ items: [{ item: "large eggs", amount: "2" }, { item: "mystery spice", amount: "1" }] }],
    });
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}chips`,
        slug: `${PREFIX}chips`,
        excerpt: "",
        typeId: type.id,
        status: "draft",
        values,
      },
    });

    try {
      await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values });
      const beforeRows = await db.recipeIngredient.findMany({
        where: { recipeId: recipe.id },
        orderBy: [{ groupIndex: "asc" }, { itemIndex: "asc" }],
      });
      assert.ok(beforeRows.length >= 1);

      const plan = await prepareRecipeIngredientIndexRows(db, {
        recipeId: recipe.id,
        values,
      });

      // C: failed transaction after replace leaves prior index (no partial hole).
      await assert.rejects(async () => {
        await db.$transaction(async (tx) => {
          await replaceRecipeIngredientIndexRows(tx, recipe.id, plan);
          throw new Error("forced failure after replace for rollback check");
        });
      }, /forced failure/);

      const afterFail = await db.recipeIngredient.findMany({
        where: { recipeId: recipe.id },
        orderBy: [{ groupIndex: "asc" }, { itemIndex: "asc" }],
      });
      assert.equal(afterFail.length, beforeRows.length);
      assert.deepEqual(
        afterFail.map((r) => ({
          authoredItem: r.authoredItem,
          ingredientId: r.ingredientId,
          matchedVia: r.matchedVia,
        })),
        beforeRows.map((r) => ({
          authoredItem: r.authoredItem,
          ingredientId: r.ingredientId,
          matchedVia: r.matchedVia,
        })),
      );

      const beforeMeta = await db.recipe.findUniqueOrThrow({
        where: { id: recipe.id },
        select: { values: true, updatedAt: true, publishedAt: true, status: true },
      });

      // I: dry-run does not mutate our recipe's index.
      const dryCountBefore = await db.recipeIngredient.count({
        where: { recipeId: recipe.id },
      });
      const dry = await backfillRecipeIngredientIndex(db, { apply: false });
      assert.equal(dry.mode, "dry_run");
      assert.equal(dry.status, "DRY_RUN");
      assert.equal(
        await db.recipeIngredient.count({ where: { recipeId: recipe.id } }),
        dryCountBefore,
      );

      // D/H: subsequent per-recipe rebuilds succeed and stay idempotent.
      // (Whole-DB apply is covered by ingredient-index.test; avoid parallel-suite races here.)
      const first = await rebuildRecipeIngredientIndex(db, {
        recipeId: recipe.id,
        values: beforeMeta.values,
      });
      const second = await rebuildRecipeIngredientIndex(db, {
        recipeId: recipe.id,
        values: beforeMeta.values,
      });
      assert.equal(second.rowCount, first.rowCount);
      assert.ok(first.rowCount >= 1);

      // G: Recipe.values / timestamps / status unchanged by index rebuild.
      const afterMeta = await db.recipe.findUniqueOrThrow({
        where: { id: recipe.id },
        select: { values: true, updatedAt: true, publishedAt: true, status: true },
      });
      assert.equal(afterMeta.values, beforeMeta.values);
      assert.equal(afterMeta.updatedAt.getTime(), beforeMeta.updatedAt.getTime());
      assert.equal(afterMeta.status, beforeMeta.status);
      assert.deepEqual(afterMeta.publishedAt, beforeMeta.publishedAt);
    } finally {
      await db.recipe.delete({ where: { id: recipe.id } }).catch(() => undefined);
    }
  });
});
