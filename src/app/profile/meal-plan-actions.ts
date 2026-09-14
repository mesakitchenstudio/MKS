"use server";

import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import {
  isMealPlannerEnabled,
  type MealPlanActionResult,
  type MealPlanItemView,
} from "@/lib/meal-planner";
import {
  addMealPlanItemForUser,
  copyMealPlanItemForUser,
  createMealPlanForUser,
  deleteMealPlanForUser,
  deleteMealPlanItemForUser,
  moveMealPlanItemForUser,
  moveMealPlanItemInSlotForUser,
  renameMealPlanForUser,
  reorderMealPlanItemsForUser,
  updateMealPlanItemForUser,
} from "@/lib/meal-planner-server";

async function requireMealPlannerMemberUserId(): Promise<
  { ok: true; userId: string } | { ok: false; result: MealPlanActionResult<never> }
> {
  if (!isMealPlannerEnabled()) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "FEATURE_DISABLED",
        message: "Meal Planner is not available right now.",
      },
    };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session.error === "MemberDeleted" ||
    session.error === "SessionRevoked"
  ) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: "Sign in to manage meal plans.",
      },
    };
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: "Sign in to manage meal plans.",
      },
    };
  }

  return { ok: true, userId: member.id };
}

export async function createMealPlanAction(
  rawName: string,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return createMealPlanForUser(authz.userId, rawName);
}

export async function renameMealPlanAction(
  planId: string,
  rawName: string,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return renameMealPlanForUser(authz.userId, planId, rawName);
}

export async function deleteMealPlanAction(
  planId: string,
): Promise<MealPlanActionResult> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return deleteMealPlanForUser(authz.userId, planId);
}

export async function addMealPlanItemAction(input: {
  planId: string;
  recipeId: string;
  planDate: string;
  mealSlot: string;
  plannedServings: number;
  note?: string;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return addMealPlanItemForUser(authz.userId, input);
}

export async function updateMealPlanItemAction(input: {
  itemId: string;
  planDate?: string;
  mealSlot?: string;
  plannedServings?: number;
  note?: string | null;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const { itemId, ...rest } = input;
  return updateMealPlanItemForUser(authz.userId, itemId, rest);
}

export async function moveMealPlanItemAction(input: {
  itemId: string;
  planDate: string;
  mealSlot: string;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return moveMealPlanItemForUser(authz.userId, input.itemId, {
    planDate: input.planDate,
    mealSlot: input.mealSlot,
    today: input.today,
  });
}

export async function copyMealPlanItemAction(input: {
  itemId: string;
  planDate: string;
  mealSlot: string;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return copyMealPlanItemForUser(authz.userId, input.itemId, {
    planDate: input.planDate,
    mealSlot: input.mealSlot,
    today: input.today,
  });
}

export async function deleteMealPlanItemAction(
  itemId: string,
): Promise<MealPlanActionResult> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return deleteMealPlanItemForUser(authz.userId, itemId);
}

export async function reorderMealPlanItemsAction(input: {
  planId: string;
  planDate: string;
  mealSlot: string;
  orderedItemIds: string[];
}): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return reorderMealPlanItemsForUser(authz.userId, input);
}

export async function moveMealPlanItemInSlotAction(input: {
  itemId: string;
  direction: "up" | "down";
}): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  return moveMealPlanItemInSlotForUser(authz.userId, input.itemId, input.direction);
}
