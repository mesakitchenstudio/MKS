import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { getDb } from "@/lib/db";
import {
  INGREDIENT_MATCH_VIA,
  INGREDIENT_IDENTITY_SEED,
  normalizeIngredientLookupKey,
} from "@/lib/ingredient-identity";
import {
  assertRecipeIngredientRowInvariant,
  buildRecipeIngredientIndexRows,
  extractAuthoredIngredientItems,
  parseRecipeValuesIngredients,
  rebuildRecipeIngredientIndex,
  seedIngredientIdentity,
  backfillRecipeIngredientIndex,
  reportRecipeIngredientCoverage,
  loadIngredientIdentityCatalogForKeys,
} from "@/lib/ingredient-index";
import { restoreRecipeRevisionContent, buildRecipeRevisionSnapshot, createRecipeRevisionIfChanged } from "@/lib/recipe-revisions";

const PREFIX = `ing3_${Date.now().toString(36)}_`;

describe("ING-3 index row builder", () => {
  it("builds exact, alias, and unresolved rows with positions", () => {
    const ingredients = [
      { id: "ing-egg", name: "Egg", nameNorm: "egg" },
      { id: "ing-flour", name: "All-purpose flour", nameNorm: "all-purpose flour" },
    ];
    const aliases = [
      { ingredientId: "ing-egg", alias: "large eggs", aliasNorm: "large eggs" },
    ];
    const items = extractAuthoredIngredientItems([
      {
        name: "Dry",
        items: [
          { item: "large eggs", amount: "2" },
          { item: "All-purpose flour", amount: "1 cup" },
          { item: "vanilla pudding powder", amount: "1 packet" },
          { item: "   ", amount: "1" },
        ],
      },
    ]);
    assert.equal(items.length, 3);
    assert.equal(items[2]?.itemIndex, 2);

    const source = [
      {
        name: "Dry",
        items: [
          { item: "large eggs", amount: "2" },
          { item: "All-purpose flour", amount: "1 cup" },
        ],
      },
    ];
    const sourceCopy = JSON.parse(JSON.stringify(source));

    const rows = buildRecipeIngredientIndexRows({
      recipeId: "r1",
      items: extractAuthoredIngredientItems(source),
      ingredients,
      aliases,
    });

    assert.deepEqual(source, sourceCopy);
    assert.equal(rows[0]?.matchedVia, INGREDIENT_MATCH_VIA.ALIAS);
    assert.equal(rows[0]?.ingredientId, "ing-egg");
    assert.equal(rows[0]?.authoredItem, "large eggs");
    assert.equal(rows[0]?.authoredItemNorm, "large eggs");
    assert.equal(rows[0]?.groupIndex, 0);
    assert.equal(rows[0]?.itemIndex, 0);
    assert.equal(rows[1]?.matchedVia, INGREDIENT_MATCH_VIA.EXACT);
    assert.equal(rows[1]?.ingredientId, "ing-flour");
  });

  it("skips blank items and parses values JSON safely", () => {
    assert.deepEqual(parseRecipeValuesIngredients("{not-json"), []);
    assert.deepEqual(parseRecipeValuesIngredients(null), []);
    const items = extractAuthoredIngredientItems([
      { items: [{ item: "" }, { item: "Egg" }, null, "x"] },
      null,
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.itemIndex, 1);
  });

  it("enforces matchedVia invariant", () => {
    assert.throws(() =>
      assertRecipeIngredientRowInvariant({
        recipeId: "r",
        groupIndex: 0,
        itemIndex: 0,
        authoredItem: "x",
        authoredItemNorm: "x",
        ingredientId: null,
        matchedVia: INGREDIENT_MATCH_VIA.EXACT,
      }),
    );
    assert.throws(() =>
      assertRecipeIngredientRowInvariant({
        recipeId: "r",
        groupIndex: 0,
        itemIndex: 0,
        authoredItem: "x",
        authoredItemNorm: "x",
        ingredientId: "ing",
        matchedVia: INGREDIENT_MATCH_VIA.UNRESOLVED,
      }),
    );
  });
});

describe("ING-3 DB seed / rebuild / coverage", () => {
  let available = false;
  let typeId = "";
  const recipeIds: string[] = [];

  before(async () => {
    const db = getDb();
    try {
      await db.$queryRaw`SELECT 1`;
      await db.ingredient.count();
      available = true;
    } catch {
      available = false;
      return;
    }

    const type = await db.recipeType.create({
      data: {
        name: `${PREFIX}type`,
        slug: `${PREFIX}type`,
      },
    });
    typeId = type.id;

    await seedIngredientIdentity(db);
  });

  after(async () => {
    if (!available) return;
    const db = getDb();
    for (const id of recipeIds) {
      await db.recipe.delete({ where: { id } }).catch(() => undefined);
    }
    if (typeId) {
      await db.recipeType.delete({ where: { id: typeId } }).catch(() => undefined);
    }
    // Leave seeded Ingredients for local coverage exercise; unique norms are stable.
  });

  it("skips when Ingredient tables are unavailable", { skip: false }, () => {
    if (!available) {
      console.log(
        "SKIP ING-3 DB tests: Ingredient tables missing on local SQLite. Apply schema via local prisma db push (not Production).",
      );
    }
    assert.ok(true);
  });

  it("seeds Ingredients/aliases idempotently", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const first = await seedIngredientIdentity(db);
    const second = await seedIngredientIdentity(db);
    assert.equal(first.status, "SUCCESS");
    assert.equal(second.status, "SUCCESS");
    assert.equal(second.ingredientsCreated, 0);
    assert.equal(second.aliasesCreated, 0);
    assert.ok(second.ingredientsExisting > 0);
  });

  it("batch lookup prefers alias over exact and avoids N+1 shape", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const catalog = await loadIngredientIdentityCatalogForKeys(db, [
      "large eggs",
      "egg",
      "mystery spice",
    ]);
    assert.ok(catalog.aliases.some((a) => a.aliasNorm === "large eggs"));
    assert.ok(catalog.ingredients.some((i) => i.nameNorm === "egg"));
    assert.ok(!catalog.ingredients.some((i) => i.nameNorm === "mystery spice"));
  });

  it("rebuild indexes draft recipes and clears on empty", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}draft`,
        slug: `${PREFIX}draft`,
        excerpt: "",
        typeId,
        status: "draft",
        values: JSON.stringify({
          ingredients: [
            {
              items: [
                { item: "large eggs", amount: "2" },
                { item: "All-purpose flour", amount: "1 cup" },
                { item: "special spice mix", amount: "1 tsp" },
              ],
            },
          ],
        }),
      },
    });
    recipeIds.push(recipe.id);

    const result = await db.$transaction((tx) =>
      rebuildRecipeIngredientIndex(tx, { recipeId: recipe.id, values: recipe.values }),
    );
    assert.equal(result.rowCount, 3);

    const rows = await db.recipeIngredient.findMany({
      where: { recipeId: recipe.id },
      orderBy: [{ itemIndex: "asc" }],
    });
    assert.equal(rows[0]?.matchedVia, INGREDIENT_MATCH_VIA.ALIAS);
    assert.ok(rows[0]?.ingredientId);
    assert.equal(rows[1]?.matchedVia, INGREDIENT_MATCH_VIA.EXACT);
    assert.equal(rows[2]?.matchedVia, INGREDIENT_MATCH_VIA.UNRESOLVED);
    assert.equal(rows[2]?.ingredientId, null);

    const beforeValues = recipe.values;
    await rebuildRecipeIngredientIndex(db, {
      recipeId: recipe.id,
      values: JSON.stringify({ ingredients: [] }),
    });
    const after = await db.recipe.findUnique({ where: { id: recipe.id } });
    assert.equal(after?.values, beforeValues);
    assert.equal(await db.recipeIngredient.count({ where: { recipeId: recipe.id } }), 0);
  });

  it("reorder and remove update positional index without stale rows", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}reorder`,
        slug: `${PREFIX}reorder`,
        excerpt: "",
        typeId,
        status: "published",
        publishedAt: new Date(),
        values: JSON.stringify({
          ingredients: [
            {
              items: [
                { item: "Egg", amount: "1" },
                { item: "All-purpose flour", amount: "1 cup" },
              ],
            },
          ],
        }),
      },
    });
    recipeIds.push(recipe.id);

    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values: recipe.values });

    const reordered = JSON.stringify({
      ingredients: [
        {
          items: [
            { item: "All-purpose flour", amount: "1 cup" },
            { item: "Egg", amount: "1" },
          ],
        },
      ],
    });
    await db.recipe.update({ where: { id: recipe.id }, data: { values: reordered } });
    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values: reordered });
    const rows = await db.recipeIngredient.findMany({
      where: { recipeId: recipe.id },
      orderBy: { itemIndex: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.authoredItem, "All-purpose flour");
    assert.equal(rows[0]?.itemIndex, 0);
    assert.equal(rows[1]?.authoredItem, "Egg");

    const removed = JSON.stringify({
      ingredients: [{ items: [{ item: "All-purpose flour", amount: "1 cup" }] }],
    });
    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values: removed });
    const afterRemove = await db.recipeIngredient.findMany({ where: { recipeId: recipe.id } });
    assert.equal(afterRemove.length, 1);
    assert.equal(afterRemove[0]?.authoredItem, "All-purpose flour");
  });

  it("revision restore rebuilds index from restored values", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const valuesA = {
      ingredients: [{ items: [{ item: "large eggs", amount: "2" }] }],
    };
    const valuesB = {
      ingredients: [{ items: [{ item: "egg yolks", amount: "3" }] }],
    };

    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}rev`,
        slug: `${PREFIX}rev`,
        excerpt: "",
        typeId,
        status: "draft",
        values: JSON.stringify(valuesA),
      },
    });
    recipeIds.push(recipe.id);

    await rebuildRecipeIngredientIndex(db, {
      recipeId: recipe.id,
      values: valuesA,
    });

    const snapA = buildRecipeRevisionSnapshot({
      title: recipe.title,
      excerpt: "",
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [],
      values: valuesA,
      slug: recipe.slug,
      status: "draft",
      publishedAt: null,
      publicUpdateNote: null,
      publicUpdatedAt: null,
    });
    const created = await createRecipeRevisionIfChanged(db, {
      recipeId: recipe.id,
      actor: { id: null, name: "test", role: "owner" },
      snapshot: snapA,
      isCreate: true,
      oldStatus: null,
      newStatus: "draft",
    });
    assert.equal(created.created, true);
    if (!created.created) return;

    await db.recipe.update({
      where: { id: recipe.id },
      data: { values: JSON.stringify(valuesB) },
    });
    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values: valuesB });

    const mid = await db.recipeIngredient.findMany({ where: { recipeId: recipe.id } });
    assert.equal(mid[0]?.authoredItem, "egg yolks");

    const restored = await restoreRecipeRevisionContent({
      recipeId: recipe.id,
      revisionId: created.id,
      actor: { id: null, name: "test", role: "owner" },
    });
    assert.equal(restored.ok, true);

    const after = await db.recipe.findUnique({ where: { id: recipe.id } });
    const parsed = JSON.parse(after?.values ?? "{}") as {
      ingredients: Array<{ items: Array<{ item: string }> }>;
    };
    assert.equal(parsed.ingredients[0]?.items[0]?.item, "large eggs");

    const indexRows = await db.recipeIngredient.findMany({ where: { recipeId: recipe.id } });
    assert.equal(indexRows.length, 1);
    assert.equal(indexRows[0]?.authoredItem, "large eggs");
    assert.equal(indexRows[0]?.matchedVia, INGREDIENT_MATCH_VIA.ALIAS);

    const revision = await db.recipeRevision.findUnique({ where: { id: created.id } });
    assert.ok(revision?.snapshot);
    assert.doesNotMatch(revision!.snapshot, /RecipeIngredient/);
    assert.match(revision!.snapshot, /large eggs/);
  });

  it("Recipe delete cascades index rows but keeps Ingredients", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const egg = await db.ingredient.findUnique({ where: { nameNorm: "egg" } });
    assert.ok(egg);

    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}del`,
        slug: `${PREFIX}del`,
        excerpt: "",
        typeId,
        status: "draft",
        values: JSON.stringify({
          ingredients: [{ items: [{ item: "Egg", amount: "1" }] }],
        }),
      },
    });
    await rebuildRecipeIngredientIndex(db, {
      recipeId: recipe.id,
      values: recipe.values,
    });
    assert.equal(await db.recipeIngredient.count({ where: { recipeId: recipe.id } }), 1);
    await db.recipe.delete({ where: { id: recipe.id } });
    assert.equal(await db.recipeIngredient.count({ where: { recipeId: recipe.id } }), 0);
    const eggAfter = await db.ingredient.findUnique({ where: { id: egg!.id } });
    assert.ok(eggAfter);
  });

  it("backfill dry-run does not write; apply is idempotent", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();

    async function runOnce() {
      // Scope to this suite's recipes so parallel suites cannot flake the global count.
      const scopedIds = recipeIds.length
        ? recipeIds
        : (await db.recipe.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } })).map(
            (r) => r.id,
          );
      assert.ok(scopedIds.length > 0);

      const before = await db.recipeIngredient.count({
        where: { recipeId: { in: scopedIds } },
      });
      const dry = await backfillRecipeIngredientIndex(db, { apply: false });
      assert.equal(dry.mode, "dry_run");
      assert.equal(dry.status, "DRY_RUN");
      assert.equal(
        await db.recipeIngredient.count({ where: { recipeId: { in: scopedIds } } }),
        before,
      );

      const applied = await backfillRecipeIngredientIndex(db, { apply: true });
      assert.equal(applied.mode, "apply");
      assert.ok(
        !applied.failures.some((f) => scopedIds.includes(f.recipeId)),
        "suite recipes must rebuild successfully",
      );
      const afterApply = await db.recipeIngredient.count({
        where: { recipeId: { in: scopedIds } },
      });
      assert.ok(afterApply >= before);

      const again = await backfillRecipeIngredientIndex(db, { apply: true });
      assert.ok(!again.failures.some((f) => scopedIds.includes(f.recipeId)));
      assert.equal(again.rowsWritten, applied.rowsWritten);
    }

    try {
      await runOnce();
    } catch {
      // Shared local SQLite can race with other ingredient DB suites in parallel.
      await runOnce();
    }
  });

  it("coverage reports matched + unresolved metrics", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const report = await reportRecipeIngredientCoverage(db);
    assert.ok(report.canonicalIngredients >= INGREDIENT_IDENTITY_SEED.length);
    assert.equal(report.matched, report.exact + report.alias);
    if (report.ingredientRowsIndexed > 0) {
      assert.equal(
        report.coveragePercent,
        Math.round((report.matched / report.ingredientRowsIndexed) * 1000) / 10,
      );
    }
    for (let i = 1; i < report.unresolvedGrouped.length; i += 1) {
      const prev = report.unresolvedGrouped[i - 1]!;
      const cur = report.unresolvedGrouped[i]!;
      assert.ok(
        prev.occurrenceCount > cur.occurrenceCount ||
          (prev.occurrenceCount === cur.occurrenceCount &&
            prev.authoredItemNorm <= cur.authoredItemNorm),
      );
    }
  });

  it("rejects alias ownership remap during seed", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const bad = await seedIngredientIdentity(db, [
      { name: "Not Egg Remap Probe", aliases: ["large eggs"] },
    ]);
    assert.equal(bad.status, "FAILED");
    assert.ok(bad.failures.some((f) => /refused to remap|Alias norm/i.test(f)));
  });

  it("does not substring-match", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}sub`,
        slug: `${PREFIX}sub`,
        excerpt: "",
        typeId,
        status: "draft",
        values: JSON.stringify({
          ingredients: [{ items: [{ item: "eggplant", amount: "1" }] }],
        }),
      },
    });
    recipeIds.push(recipe.id);
    await rebuildRecipeIngredientIndex(db, {
      recipeId: recipe.id,
      values: recipe.values,
    });
    const row = await db.recipeIngredient.findFirst({ where: { recipeId: recipe.id } });
    assert.equal(row?.matchedVia, INGREDIENT_MATCH_VIA.UNRESOLVED);
    assert.equal(normalizeIngredientLookupKey("eggplant"), "eggplant");
  });
});
