import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Recipe } from "@/data/types";
import { scaleAmount } from "@/lib/culinary-format";
import {
  aggregateShoppingList,
  applyRecipeContributions,
  buildCwywMissingContributions,
  buildRecipeShoppingContributions,
  buildShoppingListView,
  clearPurchasedContributions,
  emptyShoppingListState,
  formatShoppingListPlainText,
  formatShoppingQuantity,
  isShoppingListEnabled,
  parseShoppingListState,
  parseShoppingQuantity,
  removeContributionsByIds,
  removeRecipeContributions,
  serializeShoppingListState,
  setPurchasedKey,
  shoppingItemKeyFromAuthored,
  SHOPPING_LIST_MAX_CONTRIBUTIONS,
  SHOPPING_LIST_MAX_RECIPES,
  SHOPPING_LIST_PATH,
  sumCompatibleQuantities,
  type ShoppingListContribution,
} from "@/lib/shopping-list";

const root = join(process.cwd(), "src");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "test-recipe",
    title: "Test Recipe",
    id: "recipe-1",
    excerpt: "",
    image: "/x.jpg",
    imageAlt: "",
    categories: [],
    cuisine: "",
    method: "",
    diet: [],
    difficulty: "easy",
    servings: 4,
    servingsUnit: "servings",
    prepMinutes: 10,
    cookMinutes: 10,
    publishedAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ingredients: [
      {
        items: [
          { amount: "200 g", item: "all-purpose flour" },
          { amount: "2", item: "eggs" },
          { amount: "1 tbsp", item: "butter", notes: "melted" },
        ],
      },
    ],
    instructions: [{ steps: ["Mix"] }],
    tips: [],
    keyIngredients: [],
    whyItWorks: "",
    faqs: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    ...overrides,
  } as Recipe;
}

function contrib(
  partial: Partial<ShoppingListContribution> &
    Pick<ShoppingListContribution, "id" | "authoredItem" | "scaledAmountText">,
): ShoppingListContribution {
  const authoredItem = partial.authoredItem;
  return {
    sourceMode: "RECIPE",
    recipeId: "r1",
    recipeSlug: "r1",
    recipeTitle: "R1",
    servings: 4,
    baseServings: 4,
    groupIndex: 0,
    itemIndex: 0,
    authoredItemNorm: authoredItem.toLowerCase(),
    shoppingItemKey: shoppingItemKeyFromAuthored(authoredItem),
    amountText: partial.scaledAmountText,
    addedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("ING-7 shopping list gate and wiring", () => {
  it("defaults off and uses notFound route", () => {
    assert.equal(isShoppingListEnabled(), process.env.SHOPPING_LIST_ENABLED === "true" || process.env.NEXT_PUBLIC_SHOPPING_LIST_ENABLED === "true");
    assert.match(read("app/shopping-list/page.tsx"), /notFound\(\)/);
    assert.match(read("app/shopping-list/page.tsx"), /index: false/);
    assert.match(read("app/shopping-list/page.tsx"), /canonical: SHOPPING_LIST_PATH/);
    assert.doesNotMatch(read("lib/sitemap-entries.ts"), /shopping-list/);
    assert.equal(SHOPPING_LIST_PATH, "/shopping-list");
  });

  it("wires Recipe CTA and CWYW Add Missing", () => {
    assert.match(read("components/RecipeCard.tsx"), /AddRecipeToShoppingListButton/);
    assert.match(read("components/CookWithWhatYouHave.tsx"), /Add missing/);
    assert.match(read("components/SiteFooter.tsx"), /Shopping List/);
  });
});

describe("ING-7 contributions", () => {
  it("builds scaled snapshot contributions without mutating recipe", () => {
    const recipe = baseRecipe();
    const before = JSON.stringify(recipe.ingredients);
    const rows = buildRecipeShoppingContributions({
      recipe,
      selectedServings: 8,
      sourceMode: "RECIPE",
      identityHints: [{ groupIndex: 0, itemIndex: 1, ingredientId: "ing-egg" }],
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0]!.scaledAmountText, scaleAmount("200 g", 2));
    assert.equal(rows[1]!.ingredientId, "ing-egg");
    assert.equal(rows[1]!.scaledAmountText, scaleAmount("2", 2));
    assert.equal(rows[2]!.notes, "melted");
    assert.equal(JSON.stringify(recipe.ingredients), before);
    assert.equal(rows[0]!.id, "recipe-1:0:0");
  });

  it("CWYW missing uses base servings and source positions", () => {
    const recipe = baseRecipe();
    const rows = buildCwywMissingContributions({
      recipe,
      missing: [
        { ingredientId: "ing-butter", source: { groupIndex: 0, itemIndex: 2 } },
        { source: { groupIndex: 0, itemIndex: 0 } },
        { displayText: "broken" } as never,
      ],
    });
    assert.equal(rows.length, 2);
    assert.equal(rows.every((r) => r.sourceMode === "CWYW_MISSING"), true);
    assert.equal(rows.every((r) => r.servings === 4), true);
    assert.ok(rows.some((r) => r.authoredItem === "butter"));
    assert.ok(rows.some((r) => r.authoredItem === "all-purpose flour"));
  });
});

describe("ING-7 source mode precedence", () => {
  it("replaces, upgrades missing→full, and refuses full→missing downgrade", () => {
    const recipe = baseRecipe();
    let state = emptyShoppingListState();

    const missing = buildCwywMissingContributions({
      recipe,
      missing: [{ source: { groupIndex: 0, itemIndex: 1 } }],
    });
    let result = applyRecipeContributions(state, missing);
    assert.equal(result.outcome, "added");
    state = result.state;
    assert.equal(state.contributions.length, 1);
    assert.equal(state.contributions[0]!.sourceMode, "CWYW_MISSING");

    const full = buildRecipeShoppingContributions({
      recipe,
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    result = applyRecipeContributions(state, full);
    assert.equal(result.outcome, "updated");
    state = result.state;
    assert.equal(state.contributions.length, 3);
    assert.equal(state.contributions.every((c) => c.sourceMode === "RECIPE"), true);

    result = applyRecipeContributions(state, missing);
    assert.equal(result.outcome, "kept_full");
    assert.equal(result.state.contributions.length, 3);

    const fullSix = buildRecipeShoppingContributions({
      recipe,
      selectedServings: 6,
      sourceMode: "RECIPE",
    });
    result = applyRecipeContributions(state, fullSix);
    assert.equal(result.outcome, "updated");
    assert.equal(result.state.contributions[0]!.servings, 6);
    assert.equal(result.state.contributions[0]!.scaledAmountText, scaleAmount("200 g", 6 / 4));
  });

  it("remove recipe clears contributions", () => {
    const a = buildRecipeShoppingContributions({
      recipe: baseRecipe({ id: "a", slug: "a", title: "A" }),
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    const b = buildRecipeShoppingContributions({
      recipe: baseRecipe({
        id: "b",
        slug: "b",
        title: "B",
        ingredients: [{ items: [{ amount: "100 g", item: "all-purpose flour" }] }],
      }),
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    let state = applyRecipeContributions(emptyShoppingListState(), a).state;
    state = applyRecipeContributions(state, b).state;
    state = removeRecipeContributions(state, "a");
    assert.equal(state.contributions.every((c) => c.recipeId === "b"), true);
  });
});

describe("ING-7 quantity and merge", () => {
  it("parses fractions, counts, packages, ranges, nonnumeric", () => {
    assert.equal(parseShoppingQuantity("½").kind, "aggregatable");
    assert.equal(parseShoppingQuantity("1½ cups").kind, "aggregatable");
    assert.equal(parseShoppingQuantity("1–2 tbsp").kind, "nonaggregatable");
    assert.equal(parseShoppingQuantity("to taste").kind, "nonnumeric");
    assert.equal(parseShoppingQuantity("1 can (15 ounces)").kind, "aggregatable");
    const pkg = parseShoppingQuantity("1 can (15 ounces)");
    assert.equal(pkg.kind, "aggregatable");
    if (pkg.kind === "aggregatable") {
      assert.equal(pkg.packageDetail, "(15 ounces)");
      assert.equal(pkg.unit, "count");
    }
  });

  it("merges same-unit, g+kg, ml+l, cups; rejects cup+tbsp and oz+lb", () => {
    const g = parseShoppingQuantity("200 g");
    const kg = parseShoppingQuantity("0.5 kg");
    assert.ok(g.kind === "aggregatable" && kg.kind === "aggregatable");
    const mass = sumCompatibleQuantities([g, kg]);
    assert.ok(mass);
    assert.equal(formatShoppingQuantity(mass!), "700 g");

    const ml = parseShoppingQuantity("500 ml");
    const l = parseShoppingQuantity("1 l");
    assert.ok(ml.kind === "aggregatable" && l.kind === "aggregatable");
    const vol = sumCompatibleQuantities([ml, l]);
    assert.ok(vol);
    assert.equal(formatShoppingQuantity(vol!), "1½ l");

    const c1 = parseShoppingQuantity("1 cup");
    const c2 = parseShoppingQuantity("½ cup");
    assert.ok(c1.kind === "aggregatable" && c2.kind === "aggregatable");
    const cups = sumCompatibleQuantities([c1, c2]);
    assert.ok(cups);
    assert.equal(formatShoppingQuantity(cups!), "1½ cups");

    const tbsp = parseShoppingQuantity("8 tbsp");
    assert.ok(c1.kind === "aggregatable" && tbsp.kind === "aggregatable");
    assert.equal(sumCompatibleQuantities([c1, tbsp]), null);

    const oz = parseShoppingQuantity("8 oz");
    const lb = parseShoppingQuantity("1 lb");
    assert.ok(oz.kind === "aggregatable" && lb.kind === "aggregatable");
    assert.equal(sumCompatibleQuantities([oz, lb]), null);
  });

  it("keeps russet vs baby potato separate despite same ingredientId", () => {
    const rows = aggregateShoppingList([
      contrib({
        id: "1",
        ingredientId: "potato",
        authoredItem: "russet potatoes",
        shoppingItemKey: shoppingItemKeyFromAuthored("russet potatoes"),
        scaledAmountText: "2",
      }),
      contrib({
        id: "2",
        ingredientId: "potato",
        authoredItem: "baby potatoes",
        shoppingItemKey: shoppingItemKeyFromAuthored("baby potatoes"),
        scaledAmountText: "500 g",
      }),
    ]);
    assert.equal(rows.length, 2);
  });

  it("keeps EVOO vs olive oil separate when authored keys differ", () => {
    const rows = aggregateShoppingList([
      contrib({
        id: "1",
        ingredientId: "oil",
        authoredItem: "extra-virgin olive oil",
        shoppingItemKey: shoppingItemKeyFromAuthored("extra-virgin olive oil"),
        scaledAmountText: "2 tbsp",
      }),
      contrib({
        id: "2",
        ingredientId: "oil",
        authoredItem: "olive oil",
        shoppingItemKey: shoppingItemKeyFromAuthored("olive oil"),
        scaledAmountText: "1 tbsp",
      }),
    ]);
    assert.equal(rows.length, 2);
  });

  it("merges same shopping key flour and egg counts; separates notes", () => {
    const flour = aggregateShoppingList([
      contrib({
        id: "1",
        ingredientId: "flour",
        authoredItem: "all-purpose flour",
        shoppingItemKey: shoppingItemKeyFromAuthored("all-purpose flour"),
        scaledAmountText: "200 g",
        recipeId: "a",
        recipeTitle: "A",
      }),
      contrib({
        id: "2",
        ingredientId: "flour",
        authoredItem: "all-purpose flour",
        shoppingItemKey: shoppingItemKeyFromAuthored("all-purpose flour"),
        scaledAmountText: "0.5 kg",
        recipeId: "b",
        recipeTitle: "B",
      }),
    ]);
    assert.equal(flour.length, 1);
    assert.equal(flour[0]!.amountDisplay, "700 g");
    assert.equal(flour[0]!.sources.length, 2);

    const eggs = aggregateShoppingList([
      contrib({
        id: "e1",
        ingredientId: "egg",
        authoredItem: "eggs",
        shoppingItemKey: shoppingItemKeyFromAuthored("eggs"),
        scaledAmountText: "2",
      }),
      contrib({
        id: "e2",
        ingredientId: "egg",
        authoredItem: "eggs",
        shoppingItemKey: shoppingItemKeyFromAuthored("eggs"),
        scaledAmountText: "3",
      }),
    ]);
    assert.equal(eggs.length, 1);
    assert.equal(eggs[0]!.amountDisplay, "5");

    const notes = aggregateShoppingList([
      contrib({
        id: "n1",
        ingredientId: "butter",
        authoredItem: "butter",
        shoppingItemKey: shoppingItemKeyFromAuthored("butter"),
        scaledAmountText: "1 tbsp",
        notes: "melted",
      }),
      contrib({
        id: "n2",
        ingredientId: "butter",
        authoredItem: "butter",
        shoppingItemKey: shoppingItemKeyFromAuthored("butter"),
        scaledAmountText: "2 tbsp",
        notes: "softened",
      }),
    ]);
    assert.equal(notes.length, 2);
  });

  it("merges same package size and separates different sizes", () => {
    const same = aggregateShoppingList([
      contrib({
        id: "p1",
        authoredItem: "tomatoes",
        shoppingItemKey: shoppingItemKeyFromAuthored("tomatoes"),
        scaledAmountText: "1 can (15 ounces)",
      }),
      contrib({
        id: "p2",
        authoredItem: "tomatoes",
        shoppingItemKey: shoppingItemKeyFromAuthored("tomatoes"),
        scaledAmountText: "2 cans (15 ounces)",
      }),
    ]);
    assert.equal(same.length, 1);
    assert.match(same[0]!.amountDisplay, /3 cans \(15 ounces\)/i);

    const diff = aggregateShoppingList([
      contrib({
        id: "p3",
        authoredItem: "tomatoes",
        shoppingItemKey: shoppingItemKeyFromAuthored("tomatoes"),
        scaledAmountText: "1 can (15 ounces)",
      }),
      contrib({
        id: "p4",
        authoredItem: "tomatoes",
        shoppingItemKey: shoppingItemKeyFromAuthored("tomatoes"),
        scaledAmountText: "1 can (28 ounces)",
      }),
    ]);
    assert.equal(diff.length, 2);
  });

  it("aggregates identical unresolved nonnumeric text", () => {
    const rows = aggregateShoppingList([
      contrib({
        id: "u1",
        authoredItem: "Special spice blend",
        authoredItemNorm: "special spice blend",
        shoppingItemKey: shoppingItemKeyFromAuthored("Special spice blend"),
        scaledAmountText: "to taste",
      }),
      contrib({
        id: "u2",
        authoredItem: "Special spice blend",
        authoredItemNorm: "special spice blend",
        shoppingItemKey: shoppingItemKeyFromAuthored("Special spice blend"),
        scaledAmountText: "to taste",
      }),
    ]);
    assert.equal(rows.length, 1);
  });
});

describe("ING-7 storage and purchased", () => {
  it("round-trips and rejects malformed / oversize payloads", () => {
    const recipe = baseRecipe();
    const contributions = buildRecipeShoppingContributions({
      recipe,
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    const state = applyRecipeContributions(emptyShoppingListState(), contributions).state;
    const json = serializeShoppingListState(state);
    assert.ok(json);
    const restored = parseShoppingListState(json);
    assert.equal(restored.contributions.length, 3);

    assert.equal(parseShoppingListState("{not json").contributions.length, 0);
    assert.equal(parseShoppingListState('{"version":99,"contributions":[]}').contributions.length, 0);
    assert.equal(parseShoppingListState("x".repeat(SHOPPING_LIST_MAX_CONTRIBUTIONS)).contributions.length, 0);
  });

  it("supports purchased, clear purchased, remove row, and caps", () => {
    const contributions = buildRecipeShoppingContributions({
      recipe: baseRecipe(),
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    let state = applyRecipeContributions(emptyShoppingListState(), contributions).state;
    let view = buildShoppingListView(state);
    assert.ok(view.unchecked.length >= 1);
    const key = view.unchecked[0]!.key;
    state = setPurchasedKey(state, key, true);
    view = buildShoppingListView(state);
    assert.equal(view.purchased.some((r) => r.key === key), true);
    assert.equal(view.unchecked.some((r) => r.key === key), false);

    const purchasedIds = view.purchased.flatMap((r) => r.contributionIds);
    state = clearPurchasedContributions(state, purchasedIds);
    assert.equal(state.contributions.length < contributions.length, true);

    state = applyRecipeContributions(emptyShoppingListState(), contributions).state;
    view = buildShoppingListView(state);
    const row = view.unchecked[0]!;
    state = removeContributionsByIds(state, row.contributionIds);
    assert.equal(state.contributions.some((c) => row.contributionIds.includes(c.id)), false);

    assert.ok(SHOPPING_LIST_MAX_RECIPES >= 1);
    assert.ok(SHOPPING_LIST_MAX_CONTRIBUTIONS >= 10);

    const text = formatShoppingListPlainText(buildShoppingListView(state));
    assert.match(text, /Shopping List/);
  });
});

describe("ING-7 CWYW source positions", () => {
  it("matcher missing items include source indices", () => {
    const cwyw = read("lib/cook-with-what-you-have.ts");
    assert.match(cwyw, /source: \{ groupIndex: row\.groupIndex, itemIndex: row\.itemIndex \}/);
  });
});
