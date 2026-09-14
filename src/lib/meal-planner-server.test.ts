/**
 * Phase 5B — Meal Planner member-owned CRUD / ownership / orphan safety.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  MEAL_PLAN_DEFAULT_NAME,
  MEAL_PLAN_MAX_ITEMS,
  MEAL_PLAN_MAX_ITEMS_PER_DATE,
  MEAL_PLAN_MAX_PLANS,
  isMealPlannerEnabled,
} from "./meal-planner.ts";
import {
  addMealPlanItemForUser,
  copyMealPlanItemForUser,
  createMealPlanForUser,
  deleteMealPlanForUser,
  deleteMealPlanItemForUser,
  ensureDefaultMealPlanForUser,
  getMealPlanForUser,
  listMealPlanItemsForUser,
  listMealPlansForUser,
  moveMealPlanItemForUser,
  moveMealPlanItemInSlotForUser,
  renameMealPlanForUser,
  reorderMealPlanItemsForUser,
  updateMealPlanItemForUser,
} from "./meal-planner-server.ts";
import {
  addMealPlanItemAction,
  createMealPlanAction,
} from "../app/profile/meal-plan-actions.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const TODAY = "2026-09-14";

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

describe("Phase 5B — wiring / gate / actions (static + gate)", () => {
  it("actions authenticate, gate, and never accept client userId", () => {
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");
    assert.match(actions, /"use server"/);
    assert.match(actions, /isMealPlannerEnabled/);
    assert.match(actions, /FEATURE_DISABLED/);
    assert.match(actions, /NOT_AUTHENTICATED/);
    assert.match(actions, /findActiveMemberByEmail/);
    assert.match(actions, /createMealPlanForUser/);
    assert.match(actions, /addMealPlanItemForUser/);
    assert.doesNotMatch(actions, /userId:\s*input\.userId|body\.userId|formData\.get\(["']userId/);
    assert.doesNotMatch(actions, /recordAdminAuditEvent|meal_plan_created/);
    // Phase 5E: prepareMealPlanShoppingAction is allowed; still no client userId.
    assert.match(actions, /prepareMealPlanShoppingAction/);
  });

  it("server helpers require userId ownership paths", () => {
    const server = readRepo("src/lib/meal-planner-server.ts");
    assert.match(server, /where: \{ id: planId, userId \}/);
    assert.match(server, /plan: \{ userId \}/);
    assert.match(server, /ensureDefaultMealPlanForUser/);
    assert.match(server, /status !== "published"/);
    assert.doesNotMatch(server, /shopping-list|emitRecipeSearchAnalytics/);
  });

  it("gate OFF rejects member-facing actions without auth", async () => {
    const prevA = process.env.MEAL_PLANNER_ENABLED;
    const prevB = process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
    try {
      delete process.env.MEAL_PLANNER_ENABLED;
      delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      assert.equal(isMealPlannerEnabled(), false);
      // NEXT_PUBLIC alone must not unlock actions.
      process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), false);
      const result = await createMealPlanAction("Weekend");
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error, "FEATURE_DISABLED");
      const add = await addMealPlanItemAction({
        planId: "x",
        recipeId: "y",
        planDate: TODAY,
        mealSlot: "lunch",
        plannedServings: 2,
        today: TODAY,
      });
      assert.equal(add.ok, false);
      if (!add.ok) assert.equal(add.error, "FEATURE_DISABLED");
    } finally {
      if (prevA === undefined) delete process.env.MEAL_PLANNER_ENABLED;
      else process.env.MEAL_PLANNER_ENABLED = prevA;
      if (prevB === undefined) delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      else process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = prevB;
    }
  });

  it("gate ON path requires auth before domain helpers", () => {
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");
    assert.match(actions, /if \(!isMealPlannerEnabled\(\)\)/);
    assert.match(actions, /error: "NOT_AUTHENTICATED"/);
    assert.match(actions, /const session = await auth\(\)/);
    // Live auth() needs a Next request store; gate-off path is covered above without auth().
  });
});

describe("Phase 5B — ownership / CRUD / orphan / cascade", () => {
  const db = new PrismaClient();
  const suffix = `mp5b-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let recipePublishedId = "";
  let recipeDraftId = "";
  let recipeOrphanId = "";
  const slugPub = `mp5b-pub-${suffix}`;
  const slugDraft = `mp5b-draft-${suffix}`;
  const slugOrphan = `mp5b-orphan-${suffix}`;

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
        slug: slugPub,
        title: "Published Pasta",
        typeId,
        status: "published",
        values: "{}",
      },
    });
    recipePublishedId = published.id;

    const draft = await db.recipe.create({
      data: {
        slug: slugDraft,
        title: "Draft Soup",
        typeId,
        status: "draft",
        values: "{}",
      },
    });
    recipeDraftId = draft.id;

    const orphanTarget = await db.recipe.create({
      data: {
        slug: slugOrphan,
        title: "Soon Deleted Cake",
        typeId,
        status: "published",
        values: "{}",
      },
    });
    recipeOrphanId = orphanTarget.id;
  });

  after(async () => {
    await db.mealPlanItem.deleteMany({
      where: { plan: { userId: { in: [userA, userB] } } },
    });
    await db.mealPlan.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.recipe.deleteMany({
      where: { id: { in: [recipePublishedId, recipeDraftId, recipeOrphanId].filter(Boolean) } },
    });
    await db.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("plan CRUD: create list get rename delete + duplicate + default", async () => {
    const created = await createMealPlanForUser(userA, "  Week Plan  ");
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const listed = await listMealPlansForUser(userA);
    assert.equal(listed.some((p) => p.id === created.data.id), true);

    const got = await getMealPlanForUser(userA, created.data.id);
    assert.ok(got);
    assert.equal(got?.name, "Week Plan");

    const renamed = await renameMealPlanForUser(userA, created.data.id, " my   plan ");
    assert.equal(renamed.ok, true);
    if (renamed.ok) assert.equal(renamed.data.name, "my plan");

    const dup = await createMealPlanForUser(userA, "MY PLAN");
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.error, "DUPLICATE_PLAN_NAME");

    const ensured = await ensureDefaultMealPlanForUser(userA);
    assert.equal(ensured.ok, true);
    if (ensured.ok) {
      assert.equal(ensured.data.created, false);
      assert.equal(ensured.data.id, created.data.id);
    }

    const deleted = await deleteMealPlanForUser(userA, created.data.id);
    assert.equal(deleted.ok, true);
    assert.equal(await getMealPlanForUser(userA, created.data.id), null);

    const first = await ensureDefaultMealPlanForUser(userA);
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.data.created, true);
      assert.equal(first.data.name, MEAL_PLAN_DEFAULT_NAME);
    }
    const second = await ensureDefaultMealPlanForUser(userA);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(second.data.created, false);
      assert.equal(second.data.id, first.data.id);
    }

    const concurrent = await Promise.all([
      ensureDefaultMealPlanForUser(userA),
      ensureDefaultMealPlanForUser(userA),
      ensureDefaultMealPlanForUser(userA),
    ]);
    assert.ok(concurrent.every((r) => r.ok));
    const ids = new Set(
      concurrent.filter((r) => r.ok).map((r) => (r.ok ? r.data.id : "")),
    );
    assert.equal(ids.size, 1);
    assert.equal(await db.mealPlan.count({ where: { userId: userA } }), 1);
  });

  it("BLOCKER: User A cannot access or mutate User B plans/items", async () => {
    const planB = await createMealPlanForUser(userB, "Private B");
    assert.equal(planB.ok, true);
    if (!planB.ok) return;

    const addB = await addMealPlanItemForUser(userB, {
      planId: planB.data.id,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(addB.ok, true);
    if (!addB.ok) return;
    const itemB = addB.data.item.id;

    assert.equal(await getMealPlanForUser(userA, planB.data.id), null);
    assert.equal((await listMealPlansForUser(userA)).some((p) => p.id === planB.data.id), false);

    const rename = await renameMealPlanForUser(userA, planB.data.id, "Stolen");
    assert.equal(rename.ok, false);
    if (!rename.ok) assert.equal(rename.error, "PLAN_NOT_FOUND");

    const delPlan = await deleteMealPlanForUser(userA, planB.data.id);
    assert.equal(delPlan.ok, false);
    if (!delPlan.ok) assert.equal(delPlan.error, "PLAN_NOT_FOUND");

    const listItems = await listMealPlanItemsForUser(userA, planB.data.id);
    assert.equal(listItems.ok, false);
    if (!listItems.ok) assert.equal(listItems.error, "PLAN_NOT_FOUND");

    const add = await addMealPlanItemForUser(userA, {
      planId: planB.data.id,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 1,
      today: TODAY,
    });
    assert.equal(add.ok, false);
    if (!add.ok) assert.equal(add.error, "PLAN_NOT_FOUND");

    const update = await updateMealPlanItemForUser(userA, itemB, {
      plannedServings: 9,
      today: TODAY,
    });
    assert.equal(update.ok, false);
    if (!update.ok) assert.equal(update.error, "ITEM_NOT_FOUND");

    const move = await moveMealPlanItemForUser(userA, itemB, {
      planDate: TODAY,
      mealSlot: "snack",
      today: TODAY,
    });
    assert.equal(move.ok, false);
    if (!move.ok) assert.equal(move.error, "ITEM_NOT_FOUND");

    const copy = await copyMealPlanItemForUser(userA, itemB, {
      planDate: TODAY,
      mealSlot: "breakfast",
      today: TODAY,
    });
    assert.equal(copy.ok, false);
    if (!copy.ok) assert.equal(copy.error, "ITEM_NOT_FOUND");

    const delItem = await deleteMealPlanItemForUser(userA, itemB);
    assert.equal(delItem.ok, false);
    if (!delItem.ok) assert.equal(delItem.error, "ITEM_NOT_FOUND");

    const reorder = await reorderMealPlanItemsForUser(userA, {
      planId: planB.data.id,
      planDate: TODAY,
      mealSlot: "dinner",
      orderedItemIds: [itemB],
    });
    assert.equal(reorder.ok, false);
    if (!reorder.ok) assert.equal(reorder.error, "PLAN_NOT_FOUND");

    // B's data still intact
    assert.ok(await getMealPlanForUser(userB, planB.data.id));
    assert.equal(await db.mealPlanItem.count({ where: { id: itemB } }), 1);
  });

  it("item CRUD: published add, draft reject, denorm, ordering, move/copy/reorder/delete", async () => {
    const plan = await ensureDefaultMealPlanForUser(userA);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const planId = plan.data.id;

    const draftAdd = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipeDraftId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(draftAdd.ok, false);
    if (!draftAdd.ok) assert.equal(draftAdd.error, "RECIPE_NOT_AVAILABLE");

    const missing = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: "missing-recipe-id",
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "RECIPE_NOT_AVAILABLE");

    const badDate = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: "2026-02-30",
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(badDate.ok, false);
    if (!badDate.ok) assert.equal(badDate.error, "INVALID_DATE");

    const outOfRange = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: "2025-09-12",
      mealSlot: "lunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(outOfRange.ok, false);
    if (!outOfRange.ok) assert.equal(outOfRange.error, "DATE_OUT_OF_RANGE");

    const badSlot = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "brunch",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(badSlot.ok, false);
    if (!badSlot.ok) assert.equal(badSlot.error, "INVALID_SLOT");

    const badServings = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 0,
      today: TODAY,
    });
    assert.equal(badServings.ok, false);
    if (!badServings.ok) assert.equal(badServings.error, "INVALID_SERVINGS");

    const badNote = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "lunch",
      plannedServings: 2,
      note: "n".repeat(201),
      today: TODAY,
    });
    assert.equal(badNote.ok, false);
    if (!badNote.ok) assert.equal(badNote.error, "INVALID_NOTE");

    const first = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 4,
      note: "  use leftovers  ",
      today: TODAY,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.data.item.recipeSlug, slugPub);
    assert.equal(first.data.item.recipeTitle, "Published Pasta");
    assert.equal(first.data.item.note, "use leftovers");
    assert.equal(first.data.item.recipeAvailability, "available");
    assert.equal(first.data.item.publicRecipeSlug, slugPub);
    assert.equal(first.data.item.sortOrder, 0);

    const second = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "dinner",
      plannedServings: 2,
      today: TODAY,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.data.item.sortOrder, 1);

    const breakfast = await addMealPlanItemForUser(userA, {
      planId,
      recipeId: recipePublishedId,
      planDate: TODAY,
      mealSlot: "breakfast",
      plannedServings: 1,
      today: TODAY,
    });
    assert.equal(breakfast.ok, true);

    const listed = await listMealPlanItemsForUser(userA, planId, {
      fromDate: TODAY,
      toDate: TODAY,
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    // breakfast before dinner (canonical slot order, not lexical)
    assert.equal(listed.data.items[0]?.mealSlot, "breakfast");
    assert.equal(listed.data.items[1]?.mealSlot, "dinner");
    assert.equal(listed.data.items[2]?.mealSlot, "dinner");

    const moved = await moveMealPlanItemForUser(userA, first.data.item.id, {
      planDate: "2026-09-15",
      mealSlot: "lunch",
      today: TODAY,
    });
    assert.equal(moved.ok, true);
    if (moved.ok) {
      assert.equal(moved.data.item.planDate, "2026-09-15");
      assert.equal(moved.data.item.mealSlot, "lunch");
      assert.equal(moved.data.item.plannedServings, 4);
      assert.equal(moved.data.item.note, "use leftovers");
    }

    const copied = await copyMealPlanItemForUser(userA, second.data.item.id, {
      planDate: "2026-09-16",
      mealSlot: "snack",
      today: TODAY,
    });
    assert.equal(copied.ok, true);
    if (copied.ok) {
      assert.notEqual(copied.data.item.id, second.data.item.id);
      assert.equal(copied.data.item.recipeId, recipePublishedId);
      assert.equal(copied.data.item.plannedServings, 2);
    }

    const dinnerRows = (
      await listMealPlanItemsForUser(userA, planId, { fromDate: TODAY, toDate: TODAY })
    ).ok
      ? (
          await listMealPlanItemsForUser(userA, planId, {
            fromDate: TODAY,
            toDate: TODAY,
          })
        )
      : null;
    assert.ok(dinnerRows && dinnerRows.ok);
    if (!dinnerRows || !dinnerRows.ok) return;
    const dinnerItems = dinnerRows.data.items.filter((i) => i.mealSlot === "dinner");
    assert.ok(dinnerItems.length >= 1);

    if (dinnerItems.length >= 2) {
      const reordered = await reorderMealPlanItemsForUser(userA, {
        planId,
        planDate: TODAY,
        mealSlot: "dinner",
        orderedItemIds: [...dinnerItems.map((i) => i.id)].reverse(),
      });
      assert.equal(reordered.ok, true);
    } else {
      // After move, only second remains on dinner for TODAY — add another for reorder
      const extra = await addMealPlanItemForUser(userA, {
        planId,
        recipeId: recipePublishedId,
        planDate: TODAY,
        mealSlot: "dinner",
        plannedServings: 3,
        today: TODAY,
      });
      assert.equal(extra.ok, true);
      if (!extra.ok) return;
      const again = await listMealPlanItemsForUser(userA, planId, {
        fromDate: TODAY,
        toDate: TODAY,
      });
      assert.equal(again.ok, true);
      if (!again.ok) return;
      const ids = again.data.items.filter((i) => i.mealSlot === "dinner").map((i) => i.id);
      const reordered = await reorderMealPlanItemsForUser(userA, {
        planId,
        planDate: TODAY,
        mealSlot: "dinner",
        orderedItemIds: [...ids].reverse(),
      });
      assert.equal(reordered.ok, true);
      const up = await moveMealPlanItemInSlotForUser(userA, ids[0]!, "down");
      assert.equal(up.ok, true);
    }

    const del = await deleteMealPlanItemForUser(userA, second.data.item.id);
    assert.equal(del.ok, true);
    assert.equal(await db.mealPlanItem.count({ where: { id: second.data.item.id } }), 0);
  });

  it("enforces plan count and date item limits", async () => {
    const user = await db.user.create({
      data: { email: `limits-${suffix}@example.com`, name: "Limits" },
    });
    try {
      for (let i = 0; i < MEAL_PLAN_MAX_PLANS; i += 1) {
        const created = await createMealPlanForUser(user.id, `Plan ${i}`);
        assert.equal(created.ok, true, `plan ${i}`);
      }
      const over = await createMealPlanForUser(user.id, "Overflow");
      assert.equal(over.ok, false);
      if (!over.ok) assert.equal(over.error, "PLAN_LIMIT_REACHED");

      const plan = await listMealPlansForUser(user.id);
      const planId = plan[0]!.id;
      for (let i = 0; i < MEAL_PLAN_MAX_ITEMS_PER_DATE; i += 1) {
        const added = await addMealPlanItemForUser(user.id, {
          planId,
          recipeId: recipePublishedId,
          planDate: TODAY,
          mealSlot: i % 2 === 0 ? "lunch" : "dinner",
          plannedServings: 1,
          today: TODAY,
        });
        assert.equal(added.ok, true, `date item ${i}`);
      }
      const dateOver = await addMealPlanItemForUser(user.id, {
        planId,
        recipeId: recipePublishedId,
        planDate: TODAY,
        mealSlot: "snack",
        plannedServings: 1,
        today: TODAY,
      });
      assert.equal(dateOver.ok, false);
      if (!dateOver.ok) assert.equal(dateOver.error, "DATE_ITEM_LIMIT_REACHED");
    } finally {
      await db.mealPlanItem.deleteMany({ where: { plan: { userId: user.id } } });
      await db.mealPlan.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("plan item limit (capped fixture under 400)", async () => {
    // Full 400 inserts would be slow; verify the guard by temporarily counting near the limit path.
    // Seed MEAL_PLAN_MAX_ITEMS - 1 via createMany, then one add succeeds and next fails.
    const user = await db.user.create({
      data: { email: `cap-${suffix}@example.com`, name: "Cap" },
    });
    const plan = await db.mealPlan.create({
      data: { userId: user.id, name: "Cap Plan", nameNorm: "cap plan" },
    });
    try {
      const bulk = Array.from({ length: MEAL_PLAN_MAX_ITEMS - 1 }, (_, i) => ({
        planId: plan.id,
        recipeId: recipePublishedId,
        recipeSlug: slugPub,
        recipeTitle: "Published Pasta",
        planDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        mealSlot: "lunch",
        sortOrder: i,
        plannedServings: 1,
      }));
      // SQLite date strings above are valid for storage; horizon enforced only on API add.
      await db.mealPlanItem.createMany({ data: bulk });

      const okAdd = await addMealPlanItemForUser(user.id, {
        planId: plan.id,
        recipeId: recipePublishedId,
        planDate: TODAY,
        mealSlot: "breakfast",
        plannedServings: 1,
        today: TODAY,
      });
      assert.equal(okAdd.ok, true);

      const over = await addMealPlanItemForUser(user.id, {
        planId: plan.id,
        recipeId: recipePublishedId,
        planDate: "2026-09-15",
        mealSlot: "breakfast",
        plannedServings: 1,
        today: TODAY,
      });
      assert.equal(over.ok, false);
      if (!over.ok) assert.equal(over.error, "PLAN_ITEM_LIMIT_REACHED");
      assert.equal(MEAL_PLAN_MAX_ITEMS, 400);
    } finally {
      await db.mealPlanItem.deleteMany({ where: { planId: plan.id } });
      await db.mealPlan.delete({ where: { id: plan.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("Recipe draft → unavailable; Recipe delete → orphan SetNull", async () => {
    const plan = await createMealPlanForUser(userA, `Orphan Plan ${suffix}`);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    const added = await addMealPlanItemForUser(userA, {
      planId: plan.data.id,
      recipeId: recipeOrphanId,
      planDate: TODAY,
      mealSlot: "snack",
      plannedServings: 3,
      note: "keep me",
      today: TODAY,
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;
    const itemId = added.data.item.id;

    await db.recipe.update({
      where: { id: recipeOrphanId },
      data: { status: "draft" },
    });
    const afterDraft = await getMealPlanForUser(userA, plan.data.id);
    const draftItem = afterDraft?.items.find((i) => i.id === itemId);
    assert.ok(draftItem);
    assert.equal(draftItem?.recipeAvailability, "unavailable");
    assert.equal(draftItem?.publicRecipeSlug, null);
    assert.equal(draftItem?.recipeTitle, "Soon Deleted Cake");
    assert.equal(draftItem?.recipeId, recipeOrphanId);

    await db.recipe.delete({ where: { id: recipeOrphanId } });
    recipeOrphanId = "";

    const row = await db.mealPlanItem.findUnique({ where: { id: itemId } });
    assert.ok(row);
    assert.equal(row?.recipeId, null);
    assert.equal(row?.recipeSlug, slugOrphan);
    assert.equal(row?.recipeTitle, "Soon Deleted Cake");
    assert.equal(row?.note, "keep me");

    const afterDelete = await getMealPlanForUser(userA, plan.data.id);
    const orphanItem = afterDelete?.items.find((i) => i.id === itemId);
    assert.ok(orphanItem);
    assert.equal(orphanItem?.recipeAvailability, "orphaned");
    assert.equal(orphanItem?.publicRecipeSlug, null);
    assert.equal(orphanItem?.recipeSlug, slugOrphan);
    assert.equal(orphanItem?.recipeTitle, "Soon Deleted Cake");
  });

  it("User delete cascades MealPlan + MealPlanItem", async () => {
    const user = await db.user.create({
      data: { email: `cascade-${suffix}@example.com`, name: "Cascade" },
    });
    const plan = await db.mealPlan.create({
      data: { userId: user.id, name: "Gone", nameNorm: "gone" },
    });
    const item = await db.mealPlanItem.create({
      data: {
        planId: plan.id,
        recipeId: recipePublishedId,
        recipeSlug: slugPub,
        recipeTitle: "Published Pasta",
        planDate: TODAY,
        mealSlot: "lunch",
        sortOrder: 0,
        plannedServings: 2,
      },
    });

    await db.user.delete({ where: { id: user.id } });

    assert.equal(await db.mealPlan.count({ where: { id: plan.id } }), 0);
    assert.equal(await db.mealPlanItem.count({ where: { id: item.id } }), 0);
  });
});
