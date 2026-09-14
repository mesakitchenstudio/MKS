/**
 * Phase 5E — Meal Planner → Shopping List preparation + commit helpers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { Recipe } from "@/data/types";
import {
  addMealPlanItemForUser,
  createMealPlanForUser,
  deleteMealPlanItemForUser,
  updateMealPlanItemForUser,
} from "./meal-planner-server.ts";
import {
  aggregateMealPlanItemsByRecipeId,
  findMealPlanShoppingServingsOverflow,
  resolveMealPlanShoppingDateRange,
  shoppingContributionsLeakPlannerNote,
  MEAL_PLAN_SHOPPING_SERVINGS_MAX,
} from "./meal-planner-shopping.ts";
import { prepareMealPlanShoppingForUser } from "./meal-planner-shopping-server.ts";
import {
  commitMealPlanShoppingBatch,
  findMealPlanShoppingCollisions,
} from "./meal-planner-shopping-client.ts";
import {
  applyRecipeContributions,
  buildRecipeShoppingContributions,
  emptyShoppingListState,
  loadShoppingListState,
  saveShoppingListState,
  SHOPPING_LIST_MAX_CONTRIBUTIONS,
  SHOPPING_LIST_MAX_RECIPES,
  SHOPPING_LIST_STORAGE_KEY,
  type ShoppingListContribution,
} from "./shopping-list/index.ts";
import { prepareMealPlanShoppingAction } from "../app/profile/meal-plan-actions.ts";
import { isMealPlannerEnabled } from "./meal-planner.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const TODAY = "2026-09-14"; // Monday

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

function pastaRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "pasta",
    title: "Pasta",
    id: "pasta-id",
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
          { amount: "400 g", item: "pasta" },
          { amount: "1 tbsp", item: "olive oil", notes: "extra virgin" },
        ],
      },
    ],
    instructions: [{ steps: ["Boil"] }],
    tips: [],
    keyIngredients: [],
    whyItWorks: "",
    faqs: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    ...overrides,
  } as Recipe;
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  (globalThis as { window?: unknown }).window = {
    localStorage,
    dispatchEvent() {
      return true;
    },
  };
  return store;
}

describe("Phase 5E — aggregation + date range (pure)", () => {
  it("aggregates same Recipe.id servings across days and slots", () => {
    const week = aggregateMealPlanItemsByRecipeId([
      { recipeId: "pasta", plannedServings: 4 },
      { recipeId: "pasta", plannedServings: 2 },
      { recipeId: "salad", plannedServings: 3 },
    ]);
    assert.deepEqual(
      week.map((row) => ({ id: row.recipeId, servings: row.plannedServings, n: row.occurrenceCount })),
      [
        { id: "pasta", servings: 6, n: 2 },
        { id: "salad", servings: 3, n: 1 },
      ],
    );

    const sameDay = aggregateMealPlanItemsByRecipeId([
      { recipeId: "pasta", plannedServings: 2 },
      { recipeId: "pasta", plannedServings: 3 },
    ]);
    assert.equal(sameDay[0]!.plannedServings, 5);
  });

  it("detects servings overflow without silent clamp", () => {
    const overflow = findMealPlanShoppingServingsOverflow([
      { recipeId: "a", plannedServings: 99, occurrenceCount: 1 },
      { recipeId: "b", plannedServings: 100, occurrenceCount: 2 },
    ]);
    assert.ok(overflow);
    assert.equal(overflow!.recipeId, "b");
    assert.equal(MEAL_PLAN_SHOPPING_SERVINGS_MAX, 99);
  });

  it("resolves day and Monday week ranges with horizon checks", () => {
    const day = resolveMealPlanShoppingDateRange({
      scope: "day",
      date: "2026-09-16",
      today: TODAY,
    });
    assert.equal(day.ok, true);
    if (day.ok) {
      assert.equal(day.fromDate, "2026-09-16");
      assert.equal(day.toDate, "2026-09-16");
    }

    const week = resolveMealPlanShoppingDateRange({
      scope: "week",
      weekStart: "2026-09-14",
      today: TODAY,
    });
    assert.equal(week.ok, true);
    if (week.ok) {
      assert.equal(week.fromDate, "2026-09-14");
      assert.equal(week.toDate, "2026-09-20");
    }

    const badWeek = resolveMealPlanShoppingDateRange({
      scope: "week",
      weekStart: "2026-09-15",
      today: TODAY,
    });
    assert.equal(badWeek.ok, false);
  });

  it("detects planner private note leakage into contribution notes", () => {
    const privateNote = "Prep this Sunday";
    const leak: ShoppingListContribution[] = [
      {
        ...buildRecipeShoppingContributions({
          recipe: pastaRecipe(),
          selectedServings: 4,
          sourceMode: "RECIPE",
        })[0]!,
        notes: privateNote,
      },
    ];
    assert.equal(shoppingContributionsLeakPlannerNote(leak, [privateNote]), true);

    const safe = buildRecipeShoppingContributions({
      recipe: pastaRecipe(),
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    assert.equal(shoppingContributionsLeakPlannerNote(safe, [privateNote]), false);
    assert.equal(safe.some((row) => String(row.notes ?? "").includes("Prep this Sunday")), false);
    assert.equal(safe.some((row) => row.notes === "extra virgin"), true);
  });
});

describe("Phase 5E — atomic client batch commit", () => {
  function recipeOf(id: string, ingredientCount = 2): Recipe {
    const items = Array.from({ length: ingredientCount }, (_, i) => ({
      amount: "1",
      item: `${id}-item-${i}`,
    }));
    return pastaRecipe({
      id,
      slug: id,
      title: id,
      ingredients: [{ items }],
    });
  }

  function prepared(
    recipe: Recipe,
    servings = 4,
    sourceMode: "RECIPE" | "CWYW_MISSING" = "RECIPE",
  ) {
    return {
      recipeId: recipe.id!,
      recipeTitle: recipe.title,
      contributions: buildRecipeShoppingContributions({
        recipe,
        selectedServings: servings,
        sourceMode,
      }),
    };
  }

  function fillRecipes(count: number, prefix = "fill") {
    let state = emptyShoppingListState();
    for (let i = 0; i < count; i += 1) {
      const r = recipeOf(`${prefix}-${i}`);
      state = applyRecipeContributions(state, prepared(r).contributions).state;
    }
    return state;
  }

  it("commits a two-recipe successful batch together", () => {
    installMemoryLocalStorage();
    const a = recipeOf("a");
    const b = recipeOf("b");
    const batch = commitMealPlanShoppingBatch([prepared(a, 4), prepared(b, 3)]);
    assert.equal(batch.ok, true);
    assert.equal(batch.added, 2);
    assert.equal(batch.recipeCount, 2);
    assert.equal(batch.updated, 0);
    const ids = new Set(loadShoppingListState().contributions.map((c) => c.recipeId));
    assert.equal(ids.has("a"), true);
    assert.equal(ids.has("b"), true);
  });

  it("aborts entirely when the last recipe would exceed recipe cap", () => {
    installMemoryLocalStorage();
    const baseline = fillRecipes(SHOPPING_LIST_MAX_RECIPES - 1);
    saveShoppingListState(baseline);
    const beforeRaw = (globalThis as { window: { localStorage: Storage } }).window.localStorage.getItem(
      SHOPPING_LIST_STORAGE_KEY,
    );

    const batch = commitMealPlanShoppingBatch([
      prepared(recipeOf("new-1")),
      prepared(recipeOf("new-2")),
      prepared(recipeOf("new-3")),
    ]);
    assert.equal(batch.ok, false);
    assert.equal(batch.recipeCount, 0);
    assert.match(batch.message, /limit/i);
    assert.doesNotMatch(batch.message, /succeeded|could not be added/i);

    const afterRaw = (globalThis as { window: { localStorage: Storage } }).window.localStorage.getItem(
      SHOPPING_LIST_STORAGE_KEY,
    );
    assert.equal(afterRaw, beforeRaw);
    assert.equal(
      new Set(loadShoppingListState().contributions.map((c) => c.recipeId)).size,
      SHOPPING_LIST_MAX_RECIPES - 1,
    );
  });

  it("succeeds when batch fits recipe cap exactly", () => {
    installMemoryLocalStorage();
    saveShoppingListState(fillRecipes(SHOPPING_LIST_MAX_RECIPES - 2));
    const batch = commitMealPlanShoppingBatch([
      prepared(recipeOf("fit-1")),
      prepared(recipeOf("fit-2")),
    ]);
    assert.equal(batch.ok, true);
    assert.equal(batch.added, 2);
    assert.equal(
      new Set(loadShoppingListState().contributions.map((c) => c.recipeId)).size,
      SHOPPING_LIST_MAX_RECIPES,
    );
  });

  it("aborts on contribution-cap failure with no partial write", () => {
    installMemoryLocalStorage();
    // Fill near contribution cap with many single-ingredient recipes.
    let state = emptyShoppingListState();
    const roomForOne = 1;
    const fillCount = Math.min(
      SHOPPING_LIST_MAX_RECIPES - 2,
      SHOPPING_LIST_MAX_CONTRIBUTIONS - roomForOne,
    );
    for (let i = 0; i < fillCount; i += 1) {
      const r = recipeOf(`cap-${i}`, 1);
      state = applyRecipeContributions(state, prepared(r).contributions).state;
    }
    assert.equal(state.contributions.length, fillCount);
    saveShoppingListState(state);
    const before = serializeSnapshot();

    // First recipe: 1 contribution (fits). Second: huge contribution set that exceeds remaining room.
    const small = recipeOf("small-ok", 1);
    const hugeCount = SHOPPING_LIST_MAX_CONTRIBUTIONS - fillCount + 5;
    const huge = recipeOf("huge-fail", hugeCount);
    const batch = commitMealPlanShoppingBatch([prepared(small), prepared(huge)]);
    assert.equal(batch.ok, false);
    assert.match(batch.message, /item limit|limit/i);
    assert.equal(serializeSnapshot(), before);
    assert.equal(
      loadShoppingListState().contributions.some((c) => c.recipeId === "small-ok"),
      false,
    );
  });

  it("collision + new recipe commit atomically after confirmation path", () => {
    installMemoryLocalStorage();
    const pasta = pastaRecipe();
    const salad = recipeOf("salad");
    saveShoppingListState(
      applyRecipeContributions(
        emptyShoppingListState(),
        buildRecipeShoppingContributions({
          recipe: pasta,
          selectedServings: 4,
          sourceMode: "RECIPE",
        }),
      ).state,
    );

    const recipes = [
      {
        recipeId: pasta.id!,
        recipeTitle: pasta.title,
        contributions: buildRecipeShoppingContributions({
          recipe: pasta,
          selectedServings: 6,
          sourceMode: "RECIPE",
        }),
      },
      prepared(salad, 2),
    ];
    const collisions = findMealPlanShoppingCollisions(recipes);
    assert.equal(collisions.length, 1);

    const batch = commitMealPlanShoppingBatch(recipes);
    assert.equal(batch.ok, true);
    assert.equal(batch.updated, 1);
    assert.equal(batch.added, 1);
    assert.equal(batch.recipeCount, 2);
    const state = loadShoppingListState();
    assert.equal(state.contributions.find((c) => c.recipeId === pasta.id)?.servings, 6);
    assert.equal(state.contributions.some((c) => c.recipeId === "salad"), true);
  });

  it("replacing an existing recipe does not falsely exceed recipe cap", () => {
    installMemoryLocalStorage();
    let state = fillRecipes(SHOPPING_LIST_MAX_RECIPES - 1);
    const existing = recipeOf("existing");
    state = applyRecipeContributions(state, prepared(existing, 2).contributions).state;
    assert.equal(
      new Set(state.contributions.map((c) => c.recipeId)).size,
      SHOPPING_LIST_MAX_RECIPES,
    );
    saveShoppingListState(state);

    const batch = commitMealPlanShoppingBatch([prepared(existing, 8)]);
    assert.equal(batch.ok, true);
    assert.equal(batch.updated, 1);
    assert.equal(batch.added, 0);
    assert.equal(
      new Set(loadShoppingListState().contributions.map((c) => c.recipeId)).size,
      SHOPPING_LIST_MAX_RECIPES,
    );
    assert.equal(
      loadShoppingListState().contributions.find((c) => c.recipeId === "existing")?.servings,
      8,
    );
  });

  it("promotes CWYW_MISSING to full Recipe atomically in a batch", () => {
    installMemoryLocalStorage();
    const pasta = pastaRecipe();
    const other = recipeOf("other");
    const missing = buildRecipeShoppingContributions({
      recipe: pasta,
      selectedServings: 4,
      sourceMode: "CWYW_MISSING",
      onlyPositions: [{ groupIndex: 0, itemIndex: 0 }],
    });
    saveShoppingListState(applyRecipeContributions(emptyShoppingListState(), missing).state);

    const batch = commitMealPlanShoppingBatch([
      {
        recipeId: pasta.id!,
        recipeTitle: pasta.title,
        contributions: buildRecipeShoppingContributions({
          recipe: pasta,
          selectedServings: 6,
          sourceMode: "RECIPE",
        }),
      },
      prepared(other),
    ]);
    assert.equal(batch.ok, true);
    const state = loadShoppingListState();
    assert.equal(state.contributions.filter((c) => c.recipeId === pasta.id).every((c) => c.sourceMode === "RECIPE"), true);
    assert.equal(state.contributions.find((c) => c.recipeId === pasta.id)?.servings, 6);
    assert.equal(state.contributions.some((c) => c.recipeId === "other"), true);
  });

  it("returns failure when the single final save fails", () => {
    installMemoryLocalStorage();
    const store = (globalThis as { window: { localStorage: Storage } }).window.localStorage;
    const originalSet = store.setItem.bind(store);
    store.setItem = () => {
      throw new Error("quota");
    };
    try {
      const batch = commitMealPlanShoppingBatch([prepared(recipeOf("save-fail"))]);
      assert.equal(batch.ok, false);
      assert.match(batch.message, /could not save/i);
      assert.equal(batch.recipeCount, 0);
    } finally {
      store.setItem = originalSet;
    }
    assert.equal(loadShoppingListState().contributions.length, 0);
  });

  it("commits valid subset atomically while retaining skippedUnavailable for UI", () => {
    installMemoryLocalStorage();
    // Client commit only sees valid prepared recipes; skips are server-side.
    const batch = commitMealPlanShoppingBatch([
      prepared(recipeOf("v1")),
      prepared(recipeOf("v2")),
      prepared(recipeOf("v3")),
    ]);
    assert.equal(batch.ok, true);
    assert.equal(batch.recipeCount, 3);
    // UI appends skippedUnavailable separately — verify client leaves that to the view.
    const view = readRepo("src/components/MealPlannerView.tsx");
    assert.match(view, /skippedUnavailable/);
    assert.match(view, /unavailable meal was skipped/);
  });

  it("keeps snapshot servings until explicit re-add", () => {
    installMemoryLocalStorage();
    const pasta = pastaRecipe();
    commitMealPlanShoppingBatch([
      {
        recipeId: pasta.id!,
        recipeTitle: pasta.title,
        contributions: buildRecipeShoppingContributions({
          recipe: pasta,
          selectedServings: 6,
          sourceMode: "RECIPE",
        }),
      },
    ]);
    assert.equal(loadShoppingListState().contributions[0]!.servings, 6);
    // Conceptual planner edit ×2→×3 does not touch shopping.
    assert.equal(loadShoppingListState().contributions[0]!.servings, 6);
    commitMealPlanShoppingBatch([
      {
        recipeId: pasta.id!,
        recipeTitle: pasta.title,
        contributions: buildRecipeShoppingContributions({
          recipe: pasta,
          selectedServings: 7,
          sourceMode: "RECIPE",
        }),
      },
    ]);
    assert.equal(loadShoppingListState().contributions[0]!.servings, 7);
  });

  it("does not persist planner notes in candidate or storage", () => {
    installMemoryLocalStorage();
    const privateNote = "Prep this Sunday";
    const pasta = pastaRecipe();
    const contributions = buildRecipeShoppingContributions({
      recipe: pasta,
      selectedServings: 4,
      sourceMode: "RECIPE",
    });
    assert.equal(shoppingContributionsLeakPlannerNote(contributions, [privateNote]), false);
    const batch = commitMealPlanShoppingBatch([
      { recipeId: pasta.id!, recipeTitle: pasta.title, contributions },
    ]);
    assert.equal(batch.ok, true);
    const raw = serializeSnapshot();
    assert.ok(raw);
    assert.equal(raw!.includes(privateNote), false);
  });

  it("does not bump shopping storage version", () => {
    const types = readRepo("src/lib/shopping-list/types.ts");
    assert.match(types, /mesa:shopping-list:v1/);
    assert.match(types, /SHOPPING_LIST_VERSION = 1/);
    installMemoryLocalStorage();
    commitMealPlanShoppingBatch([prepared(recipeOf("ver"))]);
    const parsed = JSON.parse(serializeSnapshot()!);
    assert.equal(parsed.version, 1);
  });

  function serializeSnapshot() {
    return (globalThis as { window: { localStorage: Storage } }).window.localStorage.getItem(
      SHOPPING_LIST_STORAGE_KEY,
    );
  }
});

describe("Phase 5E — wiring / gates / privacy (static)", () => {
  it("uses prepare action + shoppingListEnabled prop without NEXT_PUBLIC meal planner", () => {
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");
    const view = readRepo("src/components/MealPlannerView.tsx");
    const page = readRepo("src/app/profile/meal-planner/[planId]/page.tsx");
    const server = readRepo("src/lib/meal-planner-shopping-server.ts");
    const client = readRepo("src/lib/meal-planner-shopping-client.ts");

    assert.match(actions, /prepareMealPlanShoppingAction/);
    assert.match(actions, /isShoppingListEnabled/);
    assert.match(actions, /SHOPPING_DISABLED/);
    assert.doesNotMatch(actions, /userId:\s*input\.userId/);
    assert.doesNotMatch(actions, /meal_plan_add_to_shopping|recordAdminAuditEvent/);

    assert.match(page, /shoppingListEnabled=\{isShoppingListEnabled\(\)\}/);
    assert.match(view, /shoppingListEnabled/);
    assert.match(view, /Add week to Shopping List/);
    assert.match(view, /Add this day to Shopping List/);
    assert.match(view, /Add day to Shopping List/);
    assert.doesNotMatch(view, /NEXT_PUBLIC_MEAL_PLANNER/);

    assert.match(server, /sourceMode: "RECIPE"/);
    assert.match(server, /shoppingContributionsLeakPlannerNote/);
    assert.match(server, /no localStorage/);
    assert.doesNotMatch(server, /window\.localStorage|prisma\.shopping/i);
    assert.match(client, /applyMealPlanShoppingBatchCandidate/);
    assert.match(client, /saveShoppingListState\(applied\.state\)/);
    assert.doesNotMatch(client, /could not be added/);
    assert.doesNotMatch(client, /origin:\s*["']meal_planner["']/);
  });

  it("planner mutations do not auto-touch shopping", () => {
    const server = readRepo("src/lib/meal-planner-server.ts");
    assert.doesNotMatch(server, /shopping-list|prepareMealPlanShopping|applyRecipeContributions/);
  });

  it("gate OFF prepare action rejects before shopping work", async () => {
    const prevA = process.env.MEAL_PLANNER_ENABLED;
    const prevB = process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
    const prevS = process.env.SHOPPING_LIST_ENABLED;
    const prevSp = process.env.NEXT_PUBLIC_SHOPPING_LIST_ENABLED;
    try {
      delete process.env.MEAL_PLANNER_ENABLED;
      delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      process.env.SHOPPING_LIST_ENABLED = "true";
      process.env.NEXT_PUBLIC_SHOPPING_LIST_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), false);
      process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), false);
      const result = await prepareMealPlanShoppingAction({
        planId: "x",
        scope: "day",
        date: TODAY,
        today: TODAY,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error, "FEATURE_DISABLED");
    } finally {
      if (prevA === undefined) delete process.env.MEAL_PLANNER_ENABLED;
      else process.env.MEAL_PLANNER_ENABLED = prevA;
      if (prevB === undefined) delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      else process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = prevB;
      if (prevS === undefined) delete process.env.SHOPPING_LIST_ENABLED;
      else process.env.SHOPPING_LIST_ENABLED = prevS;
      if (prevSp === undefined) delete process.env.NEXT_PUBLIC_SHOPPING_LIST_ENABLED;
      else process.env.NEXT_PUBLIC_SHOPPING_LIST_ENABLED = prevSp;
    }
  });
});

describe("Phase 5E — prepare server ownership / availability / overflow", () => {
  const db = new PrismaClient();
  const suffix = `mp5e-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let pastaId = "";
  let saladId = "";
  let draftId = "";

  const pastaValues = JSON.stringify({
    servings: 4,
    ingredients: [
      {
        items: [
          { amount: "400 g", item: "pasta" },
          { amount: "1 tbsp", item: "olive oil", notes: "extra virgin" },
        ],
      },
    ],
  });

  before(async () => {
    await db.$connect();
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const a = await db.user.create({
      data: { email: `a-${suffix}@example.com`, name: "A" },
    });
    const b = await db.user.create({
      data: { email: `b-${suffix}@example.com`, name: "B" },
    });
    userA = a.id;
    userB = b.id;

    pastaId = (
      await db.recipe.create({
        data: {
          slug: `pasta-${suffix}`,
          title: "Pasta",
          typeId,
          status: "published",
          values: pastaValues,
        },
      })
    ).id;
    saladId = (
      await db.recipe.create({
        data: {
          slug: `salad-${suffix}`,
          title: "Salad",
          typeId,
          status: "published",
          values: JSON.stringify({
            servings: 2,
            ingredients: [{ items: [{ amount: "1", item: "lettuce" }] }],
          }),
        },
      })
    ).id;
    draftId = (
      await db.recipe.create({
        data: {
          slug: `draft-${suffix}`,
          title: "Draft Stew",
          typeId,
          status: "draft",
          values: JSON.stringify({
            servings: 4,
            ingredients: [{ items: [{ amount: "1", item: "secret spice" }] }],
          }),
        },
      })
    ).id;
  });

  after(async () => {
    await db.mealPlanItem.deleteMany({
      where: { plan: { userId: { in: [userA, userB] } } },
    });
    await db.mealPlan.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.recipe.deleteMany({
      where: { id: { in: [pastaId, saladId, draftId].filter(Boolean) } },
    });
    await db.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("week prepare aggregates Pasta 4+2 → 6 and skips draft; note never leaks", async () => {
    const plan = await createMealPlanForUser(userA, "Shop Week");
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    const note = "Prep this Sunday";
    const mon = await addMealPlanItemForUser(userA, {
      planId: plan.data.id,
      recipeId: pastaId,
      planDate: "2026-09-14",
      mealSlot: "dinner",
      plannedServings: 4,
      note,
      today: TODAY,
    });
    assert.equal(mon.ok, true);

    const thu = await addMealPlanItemForUser(userA, {
      planId: plan.data.id,
      recipeId: pastaId,
      planDate: "2026-09-17",
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(thu.ok, true);

    // Draft cannot be added via API — inject orphaned-style unavailable via direct DB + draft status.
    await db.mealPlanItem.create({
      data: {
        planId: plan.data.id,
        recipeId: draftId,
        planDate: "2026-09-15",
        mealSlot: "breakfast",
        plannedServings: 2,
        sortOrder: 0,
        recipeTitle: "Draft Stew",
        recipeSlug: `draft-${suffix}`,
        note: null,
      },
    });

    const prepared = await prepareMealPlanShoppingForUser(userA, {
      planId: plan.data.id,
      scope: "week",
      weekStart: "2026-09-14",
      today: TODAY,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    assert.equal(prepared.data.recipes.length, 1);
    assert.equal(prepared.data.recipes[0]!.recipeId, pastaId);
    assert.equal(prepared.data.recipes[0]!.selectedServings, 6);
    assert.ok(prepared.data.skippedUnavailable >= 1);
    assert.equal(
      JSON.stringify(prepared.data).includes(note),
      false,
    );
    assert.equal(
      JSON.stringify(prepared.data).includes("secret spice"),
      false,
    );
    assert.equal(prepared.data.recipes[0]!.contributions[0]!.servings, 6);

    // Same-day aggregation
    const dayPlan = await createMealPlanForUser(userA, "Shop Day");
    assert.equal(dayPlan.ok, true);
    if (!dayPlan.ok) return;
    await addMealPlanItemForUser(userA, {
      planId: dayPlan.data.id,
      recipeId: pastaId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    await addMealPlanItemForUser(userA, {
      planId: dayPlan.data.id,
      recipeId: pastaId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 3,
      today: TODAY,
    });
    const day = await prepareMealPlanShoppingForUser(userA, {
      planId: dayPlan.data.id,
      scope: "day",
      date: TODAY,
      today: TODAY,
    });
    assert.equal(day.ok, true);
    if (day.ok) {
      assert.equal(day.data.recipes[0]!.selectedServings, 5);
    }
  });

  it("rejects foreign plan and servings overflow; empty week fails without payload", async () => {
    const planB = await createMealPlanForUser(userB, "Private");
    assert.equal(planB.ok, true);
    if (!planB.ok) return;
    await addMealPlanItemForUser(userB, {
      planId: planB.data.id,
      recipeId: pastaId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });

    const stolen = await prepareMealPlanShoppingForUser(userA, {
      planId: planB.data.id,
      scope: "week",
      weekStart: TODAY,
      today: TODAY,
    });
    assert.equal(stolen.ok, false);
    if (!stolen.ok) assert.equal(stolen.error, "PLAN_NOT_FOUND");

    const empty = await createMealPlanForUser(userA, "Empty Shop");
    assert.equal(empty.ok, true);
    if (!empty.ok) return;
    const emptyPrep = await prepareMealPlanShoppingForUser(userA, {
      planId: empty.data.id,
      scope: "week",
      weekStart: TODAY,
      today: TODAY,
    });
    assert.equal(emptyPrep.ok, false);
    if (!emptyPrep.ok) assert.equal(emptyPrep.error, "EMPTY_SELECTION");

    const overflowPlan = await createMealPlanForUser(userA, "Overflow");
    assert.equal(overflowPlan.ok, true);
    if (!overflowPlan.ok) return;
    await addMealPlanItemForUser(userA, {
      planId: overflowPlan.data.id,
      recipeId: pastaId,
      planDate: "2026-09-14",
      mealSlot: "lunch",
      plannedServings: 99,
      today: TODAY,
    });
    await addMealPlanItemForUser(userA, {
      planId: overflowPlan.data.id,
      recipeId: pastaId,
      planDate: "2026-09-15",
      mealSlot: "lunch",
      plannedServings: 21,
      today: TODAY,
    });
    const overflow = await prepareMealPlanShoppingForUser(userA, {
      planId: overflowPlan.data.id,
      scope: "week",
      weekStart: TODAY,
      today: TODAY,
    });
    assert.equal(overflow.ok, false);
    if (!overflow.ok) {
      assert.equal(overflow.error, "SERVINGS_OVERFLOW");
      assert.match(overflow.message, /Pasta|scaling limit/i);
      assert.doesNotMatch(overflow.message, /\b99\b.*converted|clamped/i);
    }
  });

  it("all unavailable → no recipes payload; snapshot independence after prepare", async () => {
    const plan = await createMealPlanForUser(userA, "Unavailable Only");
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    // Create published then unpublish after planning via direct status change.
    const tempId = (
      await db.recipe.create({
        data: {
          slug: `temp-${suffix}`,
          title: "Temp Pub",
          typeId,
          status: "published",
          values: pastaValues,
        },
      })
    ).id;
    const add = await addMealPlanItemForUser(userA, {
      planId: plan.data.id,
      recipeId: tempId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 4,
      today: TODAY,
    });
    assert.equal(add.ok, true);
    await db.recipe.update({ where: { id: tempId }, data: { status: "draft" } });

    const prep = await prepareMealPlanShoppingForUser(userA, {
      planId: plan.data.id,
      scope: "day",
      date: TODAY,
      today: TODAY,
    });
    assert.equal(prep.ok, false);
    if (!prep.ok) assert.equal(prep.error, "EMPTY_SELECTION");

    // Snapshot: planner item delete does not require shopping mutation APIs.
    if (add.ok) {
      await deleteMealPlanItemForUser(userA, add.data.item.id);
    }
    await db.recipe.delete({ where: { id: tempId } }).catch(() => undefined);

    // Update servings on a real plan must not import shopping helpers (covered statically);
    // exercise update still works.
    const live = await createMealPlanForUser(userA, "Live Update");
    assert.equal(live.ok, true);
    if (!live.ok) return;
    const item = await addMealPlanItemForUser(userA, {
      planId: live.data.id,
      recipeId: saladId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(item.ok, true);
    if (!item.ok) return;
    const updated = await updateMealPlanItemForUser(userA, item.data.item.id, {
      plannedServings: 3,
      today: TODAY,
    });
    assert.equal(updated.ok, true);
  });
});
