/**
 * Phase 5D — Recipe detail → Add to Meal Plan.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  MEAL_PLAN_DEFAULT_NAME,
  MEAL_PLAN_DEFAULT_SLOT,
  isMealPlannerEnabled,
  mealPlannerHrefForDate,
  startOfWeekMonday,
} from "./meal-planner.ts";
import {
  addMealPlanItemForUser,
  ensureDefaultMealPlanForUser,
  listMealPlanItemsForUser,
} from "./meal-planner-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const TODAY = "2026-09-17"; // Thursday

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 5D Recipe CTA wiring / gate", () => {
  it("gates Recipe CTA via server-derived mealPlannerEnabled only", () => {
    const page = readRepo("src/app/recipes/[slug]/page.tsx");
    const detail = readRepo("src/components/recipe/RecipeDetailView.tsx");
    const card = readRepo("src/components/RecipeCard.tsx");
    const button = readRepo("src/components/AddRecipeToMealPlanButton.tsx");
    const gate = readRepo("src/lib/meal-planner.ts");
    const preview = readRepo("src/app/admin/(preview)/recipes/[id]/preview/page.tsx");

    assert.match(page, /mealPlannerEnabled=\{isMealPlannerEnabled\(\)\}/);
    assert.match(detail, /mealPlannerEnabled=\{mealPlannerEnabled && !preview\}/);
    assert.match(card, /AddRecipeToMealPlanButton/);
    assert.match(card, /mealPlannerEnabled && recipe\.id/);
    assert.match(button, /Add to Meal Plan/);
    assert.match(button, /ensureDefaultMealPlanAction/);
    assert.match(button, /addMealPlanItemAction/);
    assert.match(button, /mesa-open-auth/);
    assert.match(button, /View Meal Plan/);
    assert.match(button, /MEAL_PLAN_DEFAULT_SLOT/);
    assert.doesNotMatch(button, /NEXT_PUBLIC_MEAL_PLANNER|trackEvent|shopping-list/);
    assert.doesNotMatch(gate, /NEXT_PUBLIC_MEAL_PLANNER_ENABLED/);
    assert.doesNotMatch(preview, /mealPlannerEnabled/);
  });

  it("defaults: dinner slot + week-start View Planner links", () => {
    assert.equal(MEAL_PLAN_DEFAULT_SLOT, "dinner");
    assert.equal(startOfWeekMonday("2026-09-14"), "2026-09-14");
    assert.equal(startOfWeekMonday("2026-09-17"), "2026-09-14");
    assert.equal(startOfWeekMonday("2026-09-20"), "2026-09-14");
    assert.equal(startOfWeekMonday("2026-09-21"), "2026-09-21");
    assert.equal(
      mealPlannerHrefForDate("plan-1", "2026-09-17"),
      "/profile/meal-planner/plan-1?week=2026-09-14",
    );
    assert.equal(
      mealPlannerHrefForDate("plan-1", "2026-09-21"),
      "/profile/meal-planner/plan-1?week=2026-09-21",
    );
  });

  it("NEXT_PUBLIC alone does not enable Recipe Meal Planner gate", () => {
    const prevA = process.env.MEAL_PLANNER_ENABLED;
    const prevB = process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
    try {
      delete process.env.MEAL_PLANNER_ENABLED;
      process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), false);
      process.env.MEAL_PLANNER_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), true);
    } finally {
      if (prevA === undefined) delete process.env.MEAL_PLANNER_ENABLED;
      else process.env.MEAL_PLANNER_ENABLED = prevA;
      if (prevB === undefined) delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      else process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = prevB;
    }
  });
});

describe("Phase 5D Recipe add domain behavior", () => {
  const db = new PrismaClient();
  const suffix = `mp5d-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let recipeId = "";
  let draftId = "";
  const slug = `mp5d-pub-${suffix}`;

  before(async () => {
    await db.$connect();
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const a = await db.user.create({
      data: { email: `a-${suffix}@example.com`, name: "Member A" },
    });
    const b = await db.user.create({
      data: { email: `b-${suffix}@example.com`, name: "Member B" },
    });
    userA = a.id;
    userB = b.id;
    const published = await db.recipe.create({
      data: {
        slug,
        title: "Weeknight Pasta",
        typeId,
        status: "published",
        values: JSON.stringify({ servings: 6 }),
      },
    });
    recipeId = published.id;
    const draft = await db.recipe.create({
      data: {
        slug: `mp5d-draft-${suffix}`,
        title: "Draft Only",
        typeId,
        status: "draft",
        values: "{}",
      },
    });
    draftId = draft.id;
  });

  after(async () => {
    await db.mealPlanItem.deleteMany({
      where: { plan: { userId: { in: [userA, userB] } } },
    });
    await db.mealPlan.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.recipe.deleteMany({ where: { id: { in: [recipeId, draftId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("zero-plan member: ensure default then add; duplicates allowed", async () => {
    assert.equal(await db.mealPlan.count({ where: { userId: userA } }), 0);
    const ensured = await ensureDefaultMealPlanForUser(userA);
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;
    assert.equal(ensured.data.name, MEAL_PLAN_DEFAULT_NAME);
    assert.equal(ensured.data.created, true);

    const first = await addMealPlanItemForUser(userA, {
      planId: ensured.data.id,
      recipeId,
      planDate: TODAY,
      mealSlot: MEAL_PLAN_DEFAULT_SLOT,
      plannedServings: 6,
      note: "family night",
      today: TODAY,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.data.item.recipeSlug, slug);
    assert.equal(first.data.item.recipeTitle, "Weeknight Pasta");
    assert.equal(first.data.item.mealSlot, "dinner");
    assert.equal(first.data.item.plannedServings, 6);
    assert.equal(first.data.item.note, "family night");

    const second = await addMealPlanItemForUser(userA, {
      planId: ensured.data.id,
      recipeId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(second.ok, true);

    const weekStart = startOfWeekMonday(TODAY)!;
    const listed = await listMealPlanItemsForUser(userA, ensured.data.id, {
      fromDate: weekStart,
      toDate: "2026-09-20",
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.ok(listed.data.items.some((item) => item.id === first.data.item.id));
    assert.ok(listed.data.items.some((item) => item.id === second.data.item.id));
    assert.equal(await db.mealPlan.count({ where: { userId: userA } }), 1);
  });

  it("rejects foreign planId and draft Recipe", async () => {
    const planB = await ensureDefaultMealPlanForUser(userB);
    assert.equal(planB.ok, true);
    if (!planB.ok) return;

    const steal = await addMealPlanItemForUser(userA, {
      planId: planB.data.id,
      recipeId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(steal.ok, false);
    if (!steal.ok) assert.equal(steal.error, "PLAN_NOT_FOUND");
    assert.equal(await db.mealPlanItem.count({ where: { planId: planB.data.id } }), 0);

    const planA = await ensureDefaultMealPlanForUser(userA);
    assert.equal(planA.ok, true);
    if (!planA.ok) return;
    const draftAdd = await addMealPlanItemForUser(userA, {
      planId: planA.data.id,
      recipeId: draftId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(draftAdd.ok, false);
    if (!draftAdd.ok) assert.equal(draftAdd.error, "RECIPE_NOT_AVAILABLE");
  });

  it("stale plan and unpublished Recipe fail safely", async () => {
    const plan = await ensureDefaultMealPlanForUser(userA);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    await db.mealPlan.delete({ where: { id: plan.data.id } });
    const missingPlan = await addMealPlanItemForUser(userA, {
      planId: plan.data.id,
      recipeId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(missingPlan.ok, false);
    if (!missingPlan.ok) assert.equal(missingPlan.error, "PLAN_NOT_FOUND");

    const fresh = await ensureDefaultMealPlanForUser(userA);
    assert.equal(fresh.ok, true);
    if (!fresh.ok) return;

    await db.recipe.update({ where: { id: recipeId }, data: { status: "draft" } });
    const unpublished = await addMealPlanItemForUser(userA, {
      planId: fresh.data.id,
      recipeId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(unpublished.ok, false);
    if (!unpublished.ok) assert.equal(unpublished.error, "RECIPE_NOT_AVAILABLE");

    await db.recipe.update({ where: { id: recipeId }, data: { status: "published" } });

    await db.recipe.delete({ where: { id: recipeId } });
    const deleted = await addMealPlanItemForUser(userA, {
      planId: fresh.data.id,
      recipeId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(deleted.ok, false);
    if (!deleted.ok) assert.equal(deleted.error, "RECIPE_NOT_AVAILABLE");
    recipeId = "";
  });
});
