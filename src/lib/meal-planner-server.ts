/**
 * Phase 5B — Member-owned Meal Planner CRUD (server-only).
 * Every mutation/read path includes userId ownership checks.
 */

import { getDb } from "@/lib/db";
import {
  MEAL_PLAN_DEFAULT_NAME,
  MEAL_PLAN_MAX_ITEMS,
  MEAL_PLAN_MAX_ITEMS_PER_DATE,
  MEAL_PLAN_MAX_PLANS,
  MEAL_SLOTS,
  isMealSlot,
  mealSlotSortIndex,
  normalizeMealPlanNameKey,
  validateMealPlanDate,
  validateMealPlanDateHorizon,
  validateMealPlanName,
  validateMealPlanNote,
  validateMealPlanServings,
  validateMealSlot,
  type MealPlanActionResult,
  type MealPlanDetail,
  type MealPlanError,
  type MealPlanItemView,
  type MealPlanRecipeAvailability,
  type MealPlanSummary,
  type MealSlot,
} from "@/lib/meal-planner";

function fail(error: MealPlanError, message: string): MealPlanActionResult<never> {
  return { ok: false, error, message };
}

type RecipeRef = {
  id: string;
  slug: string;
  title: string;
  status: string;
} | null;

type ItemRow = {
  id: string;
  planId: string;
  recipeId: string | null;
  recipeSlug: string;
  recipeTitle: string;
  planDate: string;
  mealSlot: string;
  sortOrder: number;
  plannedServings: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  recipe?: RecipeRef;
};

function recipeAvailability(recipe: RecipeRef, recipeId: string | null): MealPlanRecipeAvailability {
  if (!recipeId || !recipe) return "orphaned";
  if (recipe.status === "published") return "available";
  return "unavailable";
}

function toItemView(row: ItemRow): MealPlanItemView {
  const availability = recipeAvailability(row.recipe ?? null, row.recipeId);
  const liveSlug = row.recipe?.slug;
  const mealSlot = isMealSlot(row.mealSlot) ? row.mealSlot : MEAL_SLOTS[0];
  return {
    id: row.id,
    planId: row.planId,
    recipeId: row.recipeId,
    recipeSlug: row.recipeSlug,
    recipeTitle: row.recipeTitle,
    planDate: row.planDate,
    mealSlot,
    sortOrder: row.sortOrder,
    plannedServings: row.plannedServings,
    note: row.note,
    recipeAvailability: availability,
    publicRecipeSlug: availability === "available" && liveSlug ? liveSlug : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function compareMealPlanItems(a: ItemRow, b: ItemRow): number {
  if (a.planDate !== b.planDate) return a.planDate < b.planDate ? -1 : 1;
  const slotDiff = mealSlotSortIndex(a.mealSlot) - mealSlotSortIndex(b.mealSlot);
  if (slotDiff !== 0) return slotDiff;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.createdAt.getTime() !== b.createdAt.getTime()) {
    return a.createdAt.getTime() - b.createdAt.getTime();
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sortItemRows<T extends ItemRow>(rows: T[]): T[] {
  return [...rows].sort(compareMealPlanItems);
}

function mapHorizonError(
  result: ReturnType<typeof validateMealPlanDateHorizon>,
): MealPlanActionResult<never> | null {
  if (result.ok) return null;
  if (result.error === "OUT_OF_HORIZON") {
    return fail("DATE_OUT_OF_RANGE", result.message);
  }
  return fail("INVALID_DATE", result.message);
}

/** List plans for a member — updatedAt DESC, then name ASC. */
export async function listMealPlansForUser(userId: string): Promise<MealPlanSummary[]> {
  if (!userId) return [];
  const rows = await getDb().mealPlan.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }, { id: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameNorm: row.nameNorm,
    itemCount: row._count.items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Owner-only plan detail. Missing/foreign plan → null (no existence leak). */
export async function getMealPlanForUser(
  userId: string,
  planId: string,
  options?: { fromDate?: string; toDate?: string },
): Promise<MealPlanDetail | null> {
  if (!userId || !planId) return null;
  const plan = await getDb().mealPlan.findFirst({
    where: { id: planId, userId },
    include: {
      _count: { select: { items: true } },
      items: {
        include: {
          recipe: { select: { id: true, slug: true, title: true, status: true } },
        },
      },
    },
  });
  if (!plan) return null;

  let items = plan.items as ItemRow[];
  const from = options?.fromDate ? validateMealPlanDate(options.fromDate) : null;
  const to = options?.toDate ? validateMealPlanDate(options.toDate) : null;
  if (from?.ok) items = items.filter((item) => item.planDate >= from.planDate);
  if (to?.ok) items = items.filter((item) => item.planDate <= to.planDate);

  return {
    id: plan.id,
    name: plan.name,
    nameNorm: plan.nameNorm,
    itemCount: plan._count.items,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    items: sortItemRows(items).map(toItemView),
  };
}

export async function createMealPlanForUser(
  userId: string,
  rawName: unknown,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const validated = validateMealPlanName(rawName);
  if (!validated.ok) return fail(validated.error, validated.message);

  const db = getDb();
  const count = await db.mealPlan.count({ where: { userId } });
  if (count >= MEAL_PLAN_MAX_PLANS) {
    return fail("PLAN_LIMIT_REACHED", `You can create up to ${MEAL_PLAN_MAX_PLANS} meal plans.`);
  }

  const existing = await db.mealPlan.findUnique({
    where: { userId_nameNorm: { userId, nameNorm: validated.nameNorm } },
  });
  if (existing) {
    return fail("DUPLICATE_PLAN_NAME", "You already have a meal plan with that name.");
  }

  try {
    const created = await db.mealPlan.create({
      data: {
        userId,
        name: validated.name,
        nameNorm: validated.nameNorm,
      },
    });
    return { ok: true, data: { id: created.id, name: created.name } };
  } catch {
    return fail("DUPLICATE_PLAN_NAME", "You already have a meal plan with that name.");
  }
}

/**
 * Idempotent first-plan helper for later UI entry.
 * Prefer existing "My Meal Plan"; else most recently updated; else create default.
 */
export async function ensureDefaultMealPlanForUser(
  userId: string,
): Promise<MealPlanActionResult<{ id: string; name: string; created: boolean }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");

  const db = getDb();
  const defaultNorm = normalizeMealPlanNameKey(MEAL_PLAN_DEFAULT_NAME);

  const named = await db.mealPlan.findUnique({
    where: { userId_nameNorm: { userId, nameNorm: defaultNorm } },
  });
  if (named) {
    return { ok: true, data: { id: named.id, name: named.name, created: false } };
  }

  const any = await db.mealPlan.findFirst({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  if (any) {
    return { ok: true, data: { id: any.id, name: any.name, created: false } };
  }

  const count = await db.mealPlan.count({ where: { userId } });
  if (count >= MEAL_PLAN_MAX_PLANS) {
    return fail("PLAN_LIMIT_REACHED", `You can create up to ${MEAL_PLAN_MAX_PLANS} meal plans.`);
  }

  try {
    const created = await db.mealPlan.create({
      data: {
        userId,
        name: MEAL_PLAN_DEFAULT_NAME,
        nameNorm: defaultNorm,
      },
    });
    return { ok: true, data: { id: created.id, name: created.name, created: true } };
  } catch {
    const raced = await db.mealPlan.findUnique({
      where: { userId_nameNorm: { userId, nameNorm: defaultNorm } },
    });
    if (raced) {
      return { ok: true, data: { id: raced.id, name: raced.name, created: false } };
    }
    const fallback = await db.mealPlan.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    if (fallback) {
      return { ok: true, data: { id: fallback.id, name: fallback.name, created: false } };
    }
    return fail("DUPLICATE_PLAN_NAME", "Could not create your meal plan. Try again.");
  }
}

export async function renameMealPlanForUser(
  userId: string,
  planId: string,
  rawName: unknown,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const validated = validateMealPlanName(rawName);
  if (!validated.ok) return fail(validated.error, validated.message);

  const db = getDb();
  const plan = await db.mealPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) return fail("PLAN_NOT_FOUND", "Meal plan not found.");

  const clash = await db.mealPlan.findFirst({
    where: {
      userId,
      nameNorm: validated.nameNorm,
      NOT: { id: planId },
    },
  });
  if (clash) {
    return fail("DUPLICATE_PLAN_NAME", "You already have a meal plan with that name.");
  }

  try {
    const updated = await db.mealPlan.update({
      where: { id: planId },
      data: { name: validated.name, nameNorm: validated.nameNorm },
    });
    return { ok: true, data: { id: updated.id, name: updated.name } };
  } catch {
    return fail("DUPLICATE_PLAN_NAME", "You already have a meal plan with that name.");
  }
}

export async function deleteMealPlanForUser(
  userId: string,
  planId: string,
): Promise<MealPlanActionResult> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const db = getDb();
  const plan = await db.mealPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) return fail("PLAN_NOT_FOUND", "Meal plan not found.");

  await db.mealPlan.delete({ where: { id: planId } });
  return { ok: true };
}

export async function listMealPlanItemsForUser(
  userId: string,
  planId: string,
  options?: { fromDate?: string; toDate?: string },
): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const detail = await getMealPlanForUser(userId, planId, options);
  if (!detail) return fail("PLAN_NOT_FOUND", "Meal plan not found.");
  return { ok: true, data: { items: detail.items } };
}

type MealPlanItemAggregateClient = {
  mealPlanItem: {
    aggregate: (args: {
      where: { planId: string; planDate: string; mealSlot: string };
      _max: { sortOrder: true };
    }) => Promise<{ _max: { sortOrder: number | null } }>;
  };
};

async function nextSortOrder(
  db: MealPlanItemAggregateClient,
  planId: string,
  planDate: string,
  mealSlot: string,
): Promise<number> {
  const max = await db.mealPlanItem.aggregate({
    where: { planId, planDate, mealSlot },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? -1) + 1;
}

export async function addMealPlanItemForUser(
  userId: string,
  input: {
    planId: string;
    recipeId: string;
    planDate: unknown;
    mealSlot: unknown;
    plannedServings: unknown;
    note?: unknown;
    /** Explicit member/client civil today for horizon checks. */
    today: unknown;
  },
): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");

  const planId = String(input.planId ?? "").trim();
  const recipeId = String(input.recipeId ?? "").trim();
  if (!planId) return fail("PLAN_NOT_FOUND", "Meal plan not found.");
  if (!recipeId) return fail("RECIPE_NOT_AVAILABLE", "That recipe is not available to plan.");

  const slot = validateMealSlot(input.mealSlot);
  if (!slot.ok) return fail(slot.error, slot.message);

  const horizon = validateMealPlanDateHorizon(input.planDate, input.today);
  const horizonFail = mapHorizonError(horizon);
  if (horizonFail) return horizonFail;
  if (!horizon.ok) return fail("INVALID_DATE", "Use a valid date (YYYY-MM-DD).");

  const servings = validateMealPlanServings(input.plannedServings);
  if (!servings.ok) return fail(servings.error, servings.message);

  const note = validateMealPlanNote(input.note);
  if (!note.ok) return fail(note.error, note.message);

  const db = getDb();

  try {
    const created = await db.$transaction(async (tx) => {
      const plan = await tx.mealPlan.findFirst({ where: { id: planId, userId } });
      if (!plan) throw Object.assign(new Error("PLAN_NOT_FOUND"), { code: "PLAN_NOT_FOUND" });

      const recipe = await tx.recipe.findUnique({
        where: { id: recipeId },
        select: { id: true, slug: true, title: true, status: true },
      });
      if (!recipe || recipe.status !== "published") {
        throw Object.assign(new Error("RECIPE_NOT_AVAILABLE"), { code: "RECIPE_NOT_AVAILABLE" });
      }

      const itemCount = await tx.mealPlanItem.count({ where: { planId } });
      if (itemCount >= MEAL_PLAN_MAX_ITEMS) {
        throw Object.assign(new Error("PLAN_ITEM_LIMIT_REACHED"), { code: "PLAN_ITEM_LIMIT_REACHED" });
      }

      const dateCount = await tx.mealPlanItem.count({
        where: { planId, planDate: horizon.planDate },
      });
      if (dateCount >= MEAL_PLAN_MAX_ITEMS_PER_DATE) {
        throw Object.assign(new Error("DATE_ITEM_LIMIT_REACHED"), { code: "DATE_ITEM_LIMIT_REACHED" });
      }

      const sortOrder = await nextSortOrder(tx, planId, horizon.planDate, slot.mealSlot);

      const row = await tx.mealPlanItem.create({
        data: {
          planId,
          recipeId: recipe.id,
          recipeSlug: recipe.slug,
          recipeTitle: recipe.title,
          planDate: horizon.planDate,
          mealSlot: slot.mealSlot,
          sortOrder,
          plannedServings: servings.plannedServings,
          note: note.note ?? null,
        },
        include: {
          recipe: { select: { id: true, slug: true, title: true, status: true } },
        },
      });

      await tx.mealPlan.update({
        where: { id: planId },
        data: { updatedAt: new Date() },
      });

      return row;
    });

    return { ok: true, data: { item: toItemView(created as ItemRow) } };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "PLAN_NOT_FOUND") return fail("PLAN_NOT_FOUND", "Meal plan not found.");
    if (code === "RECIPE_NOT_AVAILABLE") {
      return fail("RECIPE_NOT_AVAILABLE", "That recipe is not available to plan.");
    }
    if (code === "PLAN_ITEM_LIMIT_REACHED") {
      return fail(
        "PLAN_ITEM_LIMIT_REACHED",
        `A meal plan can hold up to ${MEAL_PLAN_MAX_ITEMS} items.`,
      );
    }
    if (code === "DATE_ITEM_LIMIT_REACHED") {
      return fail(
        "DATE_ITEM_LIMIT_REACHED",
        `You can plan up to ${MEAL_PLAN_MAX_ITEMS_PER_DATE} items on one day.`,
      );
    }
    console.error("addMealPlanItemForUser failed", error);
    return fail("PLAN_NOT_FOUND", "Could not add that meal. Try again.");
  }
}

export async function updateMealPlanItemForUser(
  userId: string,
  itemId: string,
  input: {
    planDate?: unknown;
    mealSlot?: unknown;
    plannedServings?: unknown;
    note?: unknown;
    today: unknown;
  },
): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const id = String(itemId ?? "").trim();
  if (!id) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  const db = getDb();
  const existing = await db.mealPlanItem.findFirst({
    where: { id, plan: { userId } },
    include: { plan: { select: { id: true, userId: true } } },
  });
  if (!existing) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  let nextDate = existing.planDate;
  let nextSlot = existing.mealSlot;
  let nextServings = existing.plannedServings;
  let nextNote = existing.note;
  let dateOrSlotChanged = false;

  if (input.planDate !== undefined) {
    const horizon = validateMealPlanDateHorizon(input.planDate, input.today);
    const horizonFail = mapHorizonError(horizon);
    if (horizonFail) return horizonFail;
    if (!horizon.ok) return fail("INVALID_DATE", "Use a valid date (YYYY-MM-DD).");
    if (horizon.planDate !== existing.planDate) dateOrSlotChanged = true;
    nextDate = horizon.planDate;
  } else {
    // Re-check horizon for existing date when only other fields change? Spec: moving must re-evaluate.
    // For update that keeps date, still validate horizon if today provided.
    const horizon = validateMealPlanDateHorizon(existing.planDate, input.today);
    const horizonFail = mapHorizonError(horizon);
    if (horizonFail) return horizonFail;
  }

  if (input.mealSlot !== undefined) {
    const slot = validateMealSlot(input.mealSlot);
    if (!slot.ok) return fail(slot.error, slot.message);
    if (slot.mealSlot !== existing.mealSlot) dateOrSlotChanged = true;
    nextSlot = slot.mealSlot;
  }

  if (input.plannedServings !== undefined) {
    const servings = validateMealPlanServings(input.plannedServings);
    if (!servings.ok) return fail(servings.error, servings.message);
    nextServings = servings.plannedServings;
  }

  if (input.note !== undefined) {
    const note = validateMealPlanNote(input.note);
    if (!note.ok) return fail(note.error, note.message);
    nextNote = note.note ?? null;
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      if (nextDate !== existing.planDate) {
        const dateCount = await tx.mealPlanItem.count({
          where: {
            planId: existing.planId,
            planDate: nextDate,
            NOT: { id },
          },
        });
        if (dateCount >= MEAL_PLAN_MAX_ITEMS_PER_DATE) {
          throw Object.assign(new Error("DATE_ITEM_LIMIT_REACHED"), {
            code: "DATE_ITEM_LIMIT_REACHED",
          });
        }
      }

      let sortOrder = existing.sortOrder;
      if (dateOrSlotChanged) {
        sortOrder = await nextSortOrder(tx, existing.planId, nextDate, nextSlot);
      }

      const row = await tx.mealPlanItem.update({
        where: { id },
        data: {
          planDate: nextDate,
          mealSlot: nextSlot,
          plannedServings: nextServings,
          note: nextNote,
          sortOrder,
        },
        include: {
          recipe: { select: { id: true, slug: true, title: true, status: true } },
        },
      });

      await tx.mealPlan.update({
        where: { id: existing.planId },
        data: { updatedAt: new Date() },
      });

      return row;
    });

    return { ok: true, data: { item: toItemView(updated as ItemRow) } };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "DATE_ITEM_LIMIT_REACHED") {
      return fail(
        "DATE_ITEM_LIMIT_REACHED",
        `You can plan up to ${MEAL_PLAN_MAX_ITEMS_PER_DATE} items on one day.`,
      );
    }
    console.error("updateMealPlanItemForUser failed", error);
    return fail("ITEM_NOT_FOUND", "Could not update that meal. Try again.");
  }
}

/** Move within the same owned plan to another date and/or slot (end of destination group). */
export async function moveMealPlanItemForUser(
  userId: string,
  itemId: string,
  input: { planDate: unknown; mealSlot: unknown; today: unknown },
): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  return updateMealPlanItemForUser(userId, itemId, {
    planDate: input.planDate,
    mealSlot: input.mealSlot,
    today: input.today,
  });
}

/** Same-plan copy to a date/slot. */
export async function copyMealPlanItemForUser(
  userId: string,
  itemId: string,
  input: { planDate: unknown; mealSlot: unknown; today: unknown },
): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const id = String(itemId ?? "").trim();
  if (!id) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  const slot = validateMealSlot(input.mealSlot);
  if (!slot.ok) return fail(slot.error, slot.message);

  const horizon = validateMealPlanDateHorizon(input.planDate, input.today);
  const horizonFail = mapHorizonError(horizon);
  if (horizonFail) return horizonFail;
  if (!horizon.ok) return fail("INVALID_DATE", "Use a valid date (YYYY-MM-DD).");

  const db = getDb();
  const existing = await db.mealPlanItem.findFirst({
    where: { id, plan: { userId } },
  });
  if (!existing) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  // Copy creates a new meal entry — require a currently Published Recipe (no orphan/draft copies).
  if (!existing.recipeId) {
    return fail("RECIPE_NOT_AVAILABLE", "This recipe is no longer available.");
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const recipe = await tx.recipe.findUnique({
        where: { id: existing.recipeId! },
        select: { id: true, slug: true, title: true, status: true },
      });
      if (!recipe || recipe.status !== "published") {
        throw Object.assign(new Error("RECIPE_NOT_AVAILABLE"), { code: "RECIPE_NOT_AVAILABLE" });
      }

      const itemCount = await tx.mealPlanItem.count({ where: { planId: existing.planId } });
      if (itemCount >= MEAL_PLAN_MAX_ITEMS) {
        throw Object.assign(new Error("PLAN_ITEM_LIMIT_REACHED"), { code: "PLAN_ITEM_LIMIT_REACHED" });
      }

      const dateCount = await tx.mealPlanItem.count({
        where: { planId: existing.planId, planDate: horizon.planDate },
      });
      if (dateCount >= MEAL_PLAN_MAX_ITEMS_PER_DATE) {
        throw Object.assign(new Error("DATE_ITEM_LIMIT_REACHED"), { code: "DATE_ITEM_LIMIT_REACHED" });
      }

      const sortOrder = await nextSortOrder(
        tx,
        existing.planId,
        horizon.planDate,
        slot.mealSlot,
      );

      const row = await tx.mealPlanItem.create({
        data: {
          planId: existing.planId,
          recipeId: recipe.id,
          recipeSlug: recipe.slug,
          recipeTitle: recipe.title,
          planDate: horizon.planDate,
          mealSlot: slot.mealSlot,
          sortOrder,
          plannedServings: existing.plannedServings,
          note: existing.note,
        },
        include: {
          recipe: { select: { id: true, slug: true, title: true, status: true } },
        },
      });

      await tx.mealPlan.update({
        where: { id: existing.planId },
        data: { updatedAt: new Date() },
      });

      return row;
    });

    return { ok: true, data: { item: toItemView(created as ItemRow) } };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "RECIPE_NOT_AVAILABLE") {
      return fail("RECIPE_NOT_AVAILABLE", "This recipe is no longer available.");
    }
    if (code === "PLAN_ITEM_LIMIT_REACHED") {
      return fail(
        "PLAN_ITEM_LIMIT_REACHED",
        `A meal plan can hold up to ${MEAL_PLAN_MAX_ITEMS} items.`,
      );
    }
    if (code === "DATE_ITEM_LIMIT_REACHED") {
      return fail(
        "DATE_ITEM_LIMIT_REACHED",
        `You can plan up to ${MEAL_PLAN_MAX_ITEMS_PER_DATE} items on one day.`,
      );
    }
    console.error("copyMealPlanItemForUser failed", error);
    return fail("ITEM_NOT_FOUND", "Could not copy that meal. Try again.");
  }
}

export async function deleteMealPlanItemForUser(
  userId: string,
  itemId: string,
): Promise<MealPlanActionResult> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const id = String(itemId ?? "").trim();
  if (!id) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  const db = getDb();
  const existing = await db.mealPlanItem.findFirst({
    where: { id, plan: { userId } },
    select: { id: true, planId: true },
  });
  if (!existing) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  await db.$transaction(async (tx) => {
    await tx.mealPlanItem.delete({ where: { id: existing.id } });
    await tx.mealPlan.update({
      where: { id: existing.planId },
      data: { updatedAt: new Date() },
    });
  });

  return { ok: true };
}

/**
 * Reorder items within one planDate + mealSlot group via ordered ID list.
 * Every id must belong to the owned plan and the specified date+slot.
 */
export async function reorderMealPlanItemsForUser(
  userId: string,
  input: {
    planId: string;
    planDate: unknown;
    mealSlot: unknown;
    orderedItemIds: unknown;
  },
): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");

  const planId = String(input.planId ?? "").trim();
  if (!planId) return fail("PLAN_NOT_FOUND", "Meal plan not found.");

  const date = validateMealPlanDate(input.planDate);
  if (!date.ok) return fail(date.error, date.message);

  const slot = validateMealSlot(input.mealSlot);
  if (!slot.ok) return fail(slot.error, slot.message);

  if (!Array.isArray(input.orderedItemIds)) {
    return fail("INVALID_REORDER", "Provide an ordered list of meal items.");
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.orderedItemIds) {
    const id = String(raw ?? "").trim();
    if (!id) return fail("INVALID_REORDER", "Meal item list is invalid.");
    if (seen.has(id)) return fail("INVALID_REORDER", "Meal item list has duplicates.");
    seen.add(id);
    orderedIds.push(id);
  }

  const db = getDb();
  const plan = await db.mealPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) return fail("PLAN_NOT_FOUND", "Meal plan not found.");

  const group = await db.mealPlanItem.findMany({
    where: { planId, planDate: date.planDate, mealSlot: slot.mealSlot },
    select: { id: true },
  });
  const groupIds = new Set(group.map((row) => row.id));

  if (orderedIds.length !== groupIds.size) {
    return fail("INVALID_REORDER", "Meal item list must include every item in that slot.");
  }
  for (const id of orderedIds) {
    if (!groupIds.has(id)) {
      return fail("INVALID_REORDER", "Meal item list includes items outside that slot.");
    }
  }

  await db.$transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx.mealPlanItem.update({
        where: { id: orderedIds[index] },
        data: { sortOrder: index },
      });
    }
    await tx.mealPlan.update({
      where: { id: planId },
      data: { updatedAt: new Date() },
    });
  });

  const items = await listMealPlanItemsForUser(userId, planId, {
    fromDate: date.planDate,
    toDate: date.planDate,
  });
  if (!items.ok) return items;
  const filtered = items.data.items.filter((item) => item.mealSlot === slot.mealSlot);
  return { ok: true, data: { items: filtered } };
}

/** Swap with adjacent item in the same date+slot (Move Up / Move Down). */
export async function moveMealPlanItemInSlotForUser(
  userId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  if (!userId) return fail("NOT_AUTHENTICATED", "Sign in to manage meal plans.");
  const id = String(itemId ?? "").trim();
  if (!id) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  const db = getDb();
  const existing = await db.mealPlanItem.findFirst({
    where: { id, plan: { userId } },
  });
  if (!existing) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  const group = sortItemRows(
    (await db.mealPlanItem.findMany({
      where: {
        planId: existing.planId,
        planDate: existing.planDate,
        mealSlot: existing.mealSlot,
      },
    })) as ItemRow[],
  );

  const index = group.findIndex((row) => row.id === id);
  if (index < 0) return fail("ITEM_NOT_FOUND", "Meal item not found.");

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= group.length) {
    return {
      ok: true,
      data: {
        items: group.map(toItemView),
      },
    };
  }

  const ordered = group.map((row) => row.id);
  const tmp = ordered[index];
  ordered[index] = ordered[swapWith];
  ordered[swapWith] = tmp;

  return reorderMealPlanItemsForUser(userId, {
    planId: existing.planId,
    planDate: existing.planDate,
    mealSlot: existing.mealSlot,
    orderedItemIds: ordered,
  });
}

export type { MealSlot };
