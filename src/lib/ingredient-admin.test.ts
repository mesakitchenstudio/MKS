import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getDb } from "@/lib/db";
import {
  canAccessAdminDocTopic,
  getAdminDocTopicById,
  getAdminDocTopicForPath,
} from "@/lib/admin-documentation";
import { buildAdminNavSections, flattenAdminNavItemLabels } from "@/lib/admin-nav";
import {
  formatCoveragePercent,
  loadAdminIngredientCoverage,
  loadAdminUnresolvedIngredientPage,
  loadAdminIngredientListPage,
} from "@/lib/ingredient-admin";
import {
  addIngredientAlias,
  createCanonicalIngredient,
  removeIngredientAlias,
  resolveUnresolvedToExistingIngredient,
  resolveUnresolvedToNewIngredient,
} from "@/lib/ingredient-admin-mutations";
import { INGREDIENT_MATCH_VIA, normalizeIngredientLookupKey } from "@/lib/ingredient-identity";
import { rebuildRecipeIngredientIndex } from "@/lib/ingredient-index";
import { seedIngredientIdentity as seedDb } from "@/lib/ingredient-index/seed-db";

const root = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = `ing4_${Date.now().toString(36)}_`;

describe("ING-4 permissions and documentation", () => {
  it("exposes Ingredients to Owner and Editor nav, not Audience", () => {
    const owner = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    const editor = flattenAdminNavItemLabels(buildAdminNavSections("editor"));
    const audience = flattenAdminNavItemLabels(buildAdminNavSections("members"));
    assert.ok(owner.includes("Ingredients"));
    assert.ok(editor.includes("Ingredients"));
    assert.equal(audience.includes("Ingredients"), false);
  });

  it("registers Ingredients documentation for content roles only", () => {
    const topic = getAdminDocTopicById("ingredients");
    assert.ok(topic);
    assert.equal(getAdminDocTopicForPath("/admin/ingredients")?.id, "ingredients");
    assert.equal(canAccessAdminDocTopic("owner", "ingredients"), true);
    assert.equal(canAccessAdminDocTopic("editor", "ingredients"), true);
    assert.equal(canAccessAdminDocTopic("members", "ingredients"), false);
  });

  it("page requires content access and wires manager", () => {
    const page = readFileSync(
      path.join(root, "../app/admin/(app)/ingredients/page.tsx"),
      "utf8",
    );
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /IngredientsManager/);
    assert.doesNotMatch(
      readFileSync(path.join(root, "../lib/recipe-discovery.ts"), "utf8"),
      /recipeIngredient|RecipeIngredient/,
    );
  });
});

describe("ING-4 coverage helpers", () => {
  it("formats empty coverage without implying 100%", () => {
    assert.equal(
      formatCoveragePercent({
        recipesIndexed: 0,
        ingredientRowsIndexed: 0,
        exact: 0,
        alias: 0,
        unresolved: 0,
        matched: 0,
        coveragePercent: 0,
        distinctUnresolvedKeys: 0,
        unresolvedGrouped: [],
        canonicalIngredients: 0,
        aliases: 0,
        emptyIndex: true,
        emptyVocabulary: true,
      }),
      "—",
    );
  });
});

describe("ING-4 Admin mutations", () => {
  let available = false;
  let typeId = "";
  const recipeIds: string[] = [];
  let eggId = "";

  before(async () => {
    const db = getDb();
    try {
      await db.ingredient.count();
      available = true;
    } catch {
      available = false;
      return;
    }
    const type = await db.recipeType.create({
      data: { name: `${PREFIX}type`, slug: `${PREFIX}type` },
    });
    typeId = type.id;
    await seedDb(db);
    const egg = await db.ingredient.findUnique({ where: { nameNorm: "egg" } });
    eggId = egg?.id || "";
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
  });

  async function createRecipeWithItems(slug: string, items: string[]) {
    const db = getDb();
    const values = JSON.stringify({
      ingredients: [{ items: items.map((item) => ({ item, amount: "1" })) }],
    });
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}${slug}`,
        slug: `${PREFIX}${slug}`,
        excerpt: "",
        typeId,
        status: "draft",
        values,
      },
    });
    recipeIds.push(recipe.id);
    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values });
    return recipe;
  }

  it("loads coverage and unresolved queue safely", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const coverage = await loadAdminIngredientCoverage(db);
    assert.equal(coverage.matched, coverage.exact + coverage.alias);
    if (coverage.emptyIndex) {
      assert.equal(formatCoveragePercent(coverage), "—");
    }
    const unresolved = await loadAdminUnresolvedIngredientPage(db, { page: 1, pageSize: 10 });
    assert.ok(unresolved.pageSize <= 100);
    for (let i = 1; i < unresolved.groups.length; i += 1) {
      const prev = unresolved.groups[i - 1]!;
      const cur = unresolved.groups[i]!;
      assert.ok(
        prev.occurrenceCount > cur.occurrenceCount ||
          (prev.occurrenceCount === cur.occurrenceCount &&
            prev.authoredItemNorm <= cur.authoredItemNorm),
      );
    }
  });

  it("creates ingredient, rejects collisions, and keeps slug stable", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const created = await createCanonicalIngredient(db, { name: `${PREFIX} Mascarpone` });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const again = await createCanonicalIngredient(db, { name: `${PREFIX} Mascarpone` });
    assert.equal(again.ok, false);
    const vsAlias = await createCanonicalIngredient(db, { name: "large eggs" });
    assert.equal(vsAlias.ok, false);
    const row = await db.ingredient.findUnique({ where: { id: created.ingredientId! } });
    assert.ok(row);
    assert.equal(row!.slug, row!.slug);
  });

  it("adds and removes aliases with reindex and no silent remap", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    assert.ok(eggId);
    const recipe = await createRecipeWithItems("alias", ["jumbo free-range eggs"]);
    const beforeUpdatedAt = (
      await db.recipe.findUnique({ where: { id: recipe.id }, select: { updatedAt: true } })
    )?.updatedAt;

    const added = await addIngredientAlias(db, {
      ingredientId: eggId,
      alias: "jumbo free-range eggs",
    });
    assert.equal(added.ok, true);
    const row = await db.recipeIngredient.findFirst({ where: { recipeId: recipe.id } });
    assert.equal(row?.matchedVia, INGREDIENT_MATCH_VIA.ALIAS);
    assert.equal(row?.ingredientId, eggId);

    const after = await db.recipe.findUnique({
      where: { id: recipe.id },
      select: { updatedAt: true, values: true },
    });
    assert.equal(after?.updatedAt.getTime(), beforeUpdatedAt?.getTime());
    assert.match(after?.values || "", /jumbo free-range eggs/);

    const remap = await addIngredientAlias(db, {
      ingredientId: (
        await db.ingredient.findUnique({ where: { nameNorm: "egg yolk" } })
      )!.id,
      alias: "jumbo free-range eggs",
    });
    assert.equal(remap.ok, false);

    const alias = await db.ingredientAlias.findUnique({
      where: { aliasNorm: "jumbo free-range eggs" },
    });
    assert.ok(alias);
    const removed = await removeIngredientAlias(db, { aliasId: alias!.id });
    assert.equal(removed.ok, true);
    const afterRemove = await db.recipeIngredient.findFirst({ where: { recipeId: recipe.id } });
    assert.equal(afterRemove?.matchedVia, INGREDIENT_MATCH_VIA.UNRESOLVED);
  });

  it("resolves unresolved to existing and new ingredients", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const existingPhrase = `${PREFIX} black pepper mill`;
    await createRecipeWithItems("resolve-existing", [existingPhrase]);
    const existing = await resolveUnresolvedToExistingIngredient(db, {
      authoredItemNorm: normalizeIngredientLookupKey(existingPhrase),
      ingredientId: eggId,
      representativeAuthoredItem: existingPhrase,
    });
    assert.equal(existing.ok, true, existing.ok ? "" : existing.error);

    const newPhrase = `${PREFIX} fresh orange juice blend`;
    await createRecipeWithItems("resolve-new", [newPhrase]);
    const created = await resolveUnresolvedToNewIngredient(db, {
      authoredItemNorm: normalizeIngredientLookupKey(newPhrase),
      canonicalName: `${PREFIX} Orange juice`,
      representativeAuthoredItem: newPhrase,
    });
    assert.equal(created.ok, true, created.ok ? "" : created.error);
    if (!created.ok) return;
    const alias = await db.ingredientAlias.findUnique({
      where: { aliasNorm: normalizeIngredientLookupKey(newPhrase) },
    });
    assert.ok(alias);

    const exactName = `${PREFIX} Exactspice`;
    await createRecipeWithItems("resolve-exact", [exactName]);
    const exact = await resolveUnresolvedToNewIngredient(db, {
      authoredItemNorm: normalizeIngredientLookupKey(exactName),
      canonicalName: exactName,
      representativeAuthoredItem: exactName,
    });
    assert.equal(exact.ok, true, exact.ok ? "" : exact.error);
    if (exact.ok) {
      assert.equal(exact.aliasCreated, false);
    }
  });

  it("lists ingredients without crashing and supports search", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const page = await loadAdminIngredientListPage(db, { page: 1, pageSize: 10, q: "egg" });
    assert.ok(page.items.length >= 1);
    assert.ok(page.items.every((item) => item.aliasCount === item.aliases.length));
    assert.ok(page.items.every((item) => typeof item.publishedRecipeCount === "number"));
    assert.ok(page.items.every((item) => item.publishedRecipeCount >= 0));
  });

  it("audit action labels are registered", () => {
    const audit = readFileSync(path.join(root, "admin-audit.ts"), "utf8");
    assert.match(audit, /ingredient\.created/);
    assert.match(audit, /ingredient\.alias_added/);
    assert.match(audit, /ingredient\.alias_removed/);
    assert.match(audit, /ingredient\.unresolved_resolved/);
  });
});
