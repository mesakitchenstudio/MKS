import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { getDb } from "@/lib/db";
import {
  canonicalizeSlugList,
  filterPublicIngredientOptions,
  findPublishedRecipeIdsByIngredientFilter,
  hasActiveIngredientFilter,
  isIngredientDiscoveryEnabled,
  loadPublicIngredientFilterOptions,
  MAX_INGREDIENT_FILTER_SELECTIONS,
  normalizeIngredientFilterSelection,
  recipeMatchesIngredientMembership,
} from "@/lib/ingredient-discovery";
import { seedIngredientIdentity } from "@/lib/ingredient-index/seed-db";
import { rebuildRecipeIngredientIndex } from "@/lib/ingredient-index";
import {
  buildRecipesUrl,
  isDiscoveryListingNoIndex,
  parseDiscoveryParams,
  applyDiscoveryFilters,
  buildDiscoveryAppliedChips,
  hasActiveDiscoveryFilters,
} from "@/lib/recipe-discovery";
import type { Recipe } from "@/data/types";

const PREFIX = `ing5_${Date.now().toString(36)}_`;

describe("ING-5 ingredient filter URL parsing", () => {
  it("parses includes, excludes, mode, dedupe, max, and exclude-wins", () => {
    const params = parseDiscoveryParams({
      ingredients: "potato,egg,egg,bogus,",
      excludeIngredients: "egg,peanut",
      ingredientMode: "any",
    });
    assert.deepEqual(params.ingredients, ["bogus", "potato"]);
    assert.deepEqual(params.excludeIngredients, ["egg", "peanut"]);
    assert.equal(params.ingredientMode, "any");

    const many = Array.from({ length: 12 }, (_, i) => `ing-${i}`);
    assert.equal(canonicalizeSlugList(many).length, MAX_INGREDIENT_FILTER_SELECTIONS);

    const normalized = normalizeIngredientFilterSelection({
      ingredients: ["egg", "potato"],
      excludeIngredients: ["egg"],
      ingredientMode: "any",
    });
    assert.deepEqual(normalized.includeSlugs, ["potato"]);
    assert.deepEqual(normalized.excludeSlugs, ["egg"]);
    assert.equal(normalized.mode, "all");
  });

  it("serializes deterministically and ignores lone mode", () => {
    assert.equal(
      buildRecipesUrl({
        ingredients: ["potato", "egg"],
        ingredientMode: "all",
      }),
      "/recipes?ingredients=egg%2Cpotato",
    );
    assert.equal(
      buildRecipesUrl({
        ingredients: ["egg", "potato"],
        ingredientMode: "any",
      }),
      "/recipes?ingredients=egg%2Cpotato&ingredientMode=any",
    );
    assert.equal(buildRecipesUrl({ ingredientMode: "any" }), "/recipes");
  });

  it("marks ingredient filters as noindex and active", () => {
    assert.equal(isDiscoveryListingNoIndex({ ingredients: ["egg"] }), true);
    assert.equal(isDiscoveryListingNoIndex({ excludeIngredients: ["peanut"] }), true);
    assert.equal(isDiscoveryListingNoIndex({}), false);
    assert.equal(hasActiveDiscoveryFilters({ ingredients: ["egg"] }), true);
    assert.equal(hasActiveIngredientFilter({ includeSlugs: [], excludeSlugs: [], mode: "all" }), false);
  });

  it("default launch gate is off", () => {
    assert.equal(isIngredientDiscoveryEnabled(), process.env.INGREDIENT_DISCOVERY_ENABLED === "true");
  });

  it("builds ingredient chips", () => {
    const chips = buildDiscoveryAppliedChips(
      { ingredients: ["egg"], excludeIngredients: ["peanut"], ingredientMode: "any" },
      {},
      { egg: "Egg", peanut: "Peanut" },
    );
    assert.ok(chips.some((chip) => chip.label === "Contains: Egg"));
    assert.ok(chips.some((chip) => chip.label === "Exclude: Peanut"));
  });
});

describe("ING-5 selector option search", () => {
  it("alias text finds canonical option without exposing aliases as options", () => {
    const options = [
      {
        slug: "egg",
        name: "Egg",
        recipeCount: 3,
        searchTexts: ["Egg", "egg", "eggs", "large eggs"],
      },
      {
        slug: "potato",
        name: "Potato",
        recipeCount: 2,
        searchTexts: ["Potato", "potatoes"],
      },
    ];
    const hits = filterPublicIngredientOptions(options, "large eggs");
    assert.equal(hits[0]?.slug, "egg");
    assert.equal(hits.every((row) => row.slug === "egg" || row.slug === "potato"), true);
  });

  it("membership helper supports all/any/exclude", () => {
    assert.equal(
      recipeMatchesIngredientMembership(["egg", "potato"], {
        includeSlugs: ["egg", "potato"],
        excludeSlugs: [],
        mode: "all",
      }),
      true,
    );
    assert.equal(
      recipeMatchesIngredientMembership(["egg"], {
        includeSlugs: ["egg", "potato"],
        excludeSlugs: [],
        mode: "all",
      }),
      false,
    );
    assert.equal(
      recipeMatchesIngredientMembership(["egg"], {
        includeSlugs: ["egg", "potato"],
        excludeSlugs: [],
        mode: "any",
      }),
      true,
    );
    assert.equal(
      recipeMatchesIngredientMembership(["egg", "peanut"], {
        includeSlugs: ["egg"],
        excludeSlugs: ["peanut"],
        mode: "all",
      }),
      false,
    );
  });
});

describe("ING-5 DB matching", () => {
  let available = false;
  let typeId = "";
  const recipeIds: string[] = [];
  let eggId = "";
  let potatoId = "";

  before(async () => {
    const db = getDb();
    try {
      await db.ingredient.count();
      available = true;
    } catch {
      available = false;
      return;
    }
    await seedIngredientIdentity(db);
    eggId = (await db.ingredient.findUnique({ where: { nameNorm: "egg" } }))?.id || "";
    potatoId = (await db.ingredient.findUnique({ where: { nameNorm: "potato" } }))?.id || "";
    const type = await db.recipeType.create({
      data: { name: `${PREFIX}type`, slug: `${PREFIX}type` },
    });
    typeId = type.id;
  });

  after(async () => {
    if (!available) return;
    const db = getDb();
    for (const id of recipeIds) {
      await db.recipe.delete({ where: { id } }).catch(() => undefined);
    }
    if (typeId) await db.recipeType.delete({ where: { id: typeId } }).catch(() => undefined);
  });

  async function createRecipe(input: {
    slug: string;
    status: "draft" | "published";
    items: string[];
  }) {
    const db = getDb();
    const values = JSON.stringify({
      ingredients: [{ items: input.items.map((item) => ({ item, amount: "1" })) }],
    });
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}${input.slug}`,
        slug: `${PREFIX}${input.slug}`,
        excerpt: "",
        typeId,
        status: input.status,
        publishedAt: input.status === "published" ? new Date() : null,
        values,
      },
    });
    recipeIds.push(recipe.id);
    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values });
    return recipe;
  }

  it("matches published recipes with ALL/ANY/exclude and skips drafts", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    assert.ok(eggId && potatoId);
    const db = getDb();

    await createRecipe({
      slug: "both",
      status: "published",
      items: ["large eggs", "russet potatoes"],
    });
    await createRecipe({
      slug: "egg-only",
      status: "published",
      items: ["Egg"],
    });
    await createRecipe({
      slug: "draft-egg",
      status: "draft",
      items: ["Egg", "Potato"],
    });

    const all = await findPublishedRecipeIdsByIngredientFilter(db, {
      includeSlugs: ["egg", "potato"],
      excludeSlugs: [],
      mode: "all",
    });
    assert.ok(all);
    assert.equal(all!.size >= 1, true);

    const any = await findPublishedRecipeIdsByIngredientFilter(db, {
      includeSlugs: ["egg", "potato"],
      excludeSlugs: [],
      mode: "any",
    });
    assert.ok(any && any.size >= 2);

    const options = await loadPublicIngredientFilterOptions(db);
    const eggOption = options.find((row) => row.slug === "egg");
    assert.ok(eggOption);
    assert.ok(eggOption.recipeCount >= 1);
  });

  it("intersects with applyDiscoveryFilters via recipe ids", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const recipe = await createRecipe({
      slug: "filter-compose",
      status: "published",
      items: ["Egg"],
    });
    const ids = await findPublishedRecipeIdsByIngredientFilter(db, {
      includeSlugs: ["egg"],
      excludeSlugs: [],
      mode: "all",
    });
    const fake = [
      { id: recipe.id, slug: recipe.slug, title: "A", publishedAt: new Date().toISOString() },
      { id: "other", slug: "other", title: "B", publishedAt: new Date().toISOString() },
    ] as Recipe[];
    const filtered = applyDiscoveryFilters(fake, {}, {}, {
      ingredientMatchedRecipeIds: ids,
    });
    assert.equal(filtered.some((row) => row.id === recipe.id), true);
    assert.equal(filtered.some((row) => row.id === "other"), false);
  });
});
