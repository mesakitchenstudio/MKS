"use server";

import { revalidatePath } from "next/cache";
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
  ensureDefaultMealPlanForUser,
  listMealPlansForUser,
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

function revalidateMealPlanner(planIds?: string[]) {
  revalidatePath("/profile/meal-planner");
  for (const planId of planIds ?? []) {
    if (planId) revalidatePath(`/profile/meal-planner/${planId}`);
  }
}

export async function ensureDefaultMealPlanAction(): Promise<
  MealPlanActionResult<{ id: string; name: string; created: boolean }>
> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await ensureDefaultMealPlanForUser(authz.userId);
  if (result.ok) revalidateMealPlanner([result.data.id]);
  return result;
}

export async function listMealPlansAction(): Promise<
  MealPlanActionResult<{ plans: { id: string; name: string }[] }>
> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const plans = await listMealPlansForUser(authz.userId);
  return {
    ok: true,
    data: { plans: plans.map((plan) => ({ id: plan.id, name: plan.name })) },
  };
}

export async function createMealPlanAction(
  rawName: string,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await createMealPlanForUser(authz.userId, rawName);
  if (result.ok) revalidateMealPlanner([result.data.id]);
  return result;
}

export async function renameMealPlanAction(
  planId: string,
  rawName: string,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await renameMealPlanForUser(authz.userId, planId, rawName);
  if (result.ok) revalidateMealPlanner([planId]);
  return result;
}

export async function deleteMealPlanAction(
  planId: string,
): Promise<MealPlanActionResult> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await deleteMealPlanForUser(authz.userId, planId);
  if (result.ok) revalidateMealPlanner([planId]);
  return result;
}

/**
 * Delete a plan, then ensure a selectable plan remains (default "My Meal Plan" if none).
 * Orchestration for UI — does not embed ensure inside low-level delete.
 */
export async function deleteMealPlanAndSelectNextAction(
  planId: string,
): Promise<MealPlanActionResult<{ id: string; name: string }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;

  const deleted = await deleteMealPlanForUser(authz.userId, planId);
  if (!deleted.ok) return deleted;

  const remaining = await listMealPlansForUser(authz.userId);
  if (remaining.length > 0) {
    revalidateMealPlanner([planId, remaining[0]!.id]);
    return { ok: true, data: { id: remaining[0]!.id, name: remaining[0]!.name } };
  }

  const ensured = await ensureDefaultMealPlanForUser(authz.userId);
  if (!ensured.ok) return ensured;
  revalidateMealPlanner([planId, ensured.data.id]);
  return { ok: true, data: { id: ensured.data.id, name: ensured.data.name } };
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
  const result = await addMealPlanItemForUser(authz.userId, input);
  if (result.ok) revalidateMealPlanner([input.planId]);
  return result;
}

export async function updateMealPlanItemAction(input: {
  itemId: string;
  planId: string;
  planDate?: string;
  mealSlot?: string;
  plannedServings?: number;
  note?: string | null;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const { itemId, planId, ...rest } = input;
  const result = await updateMealPlanItemForUser(authz.userId, itemId, rest);
  if (result.ok) revalidateMealPlanner([planId]);
  return result;
}

export async function moveMealPlanItemAction(input: {
  itemId: string;
  planId: string;
  planDate: string;
  mealSlot: string;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await moveMealPlanItemForUser(authz.userId, input.itemId, {
    planDate: input.planDate,
    mealSlot: input.mealSlot,
    today: input.today,
  });
  if (result.ok) revalidateMealPlanner([input.planId]);
  return result;
}

export async function copyMealPlanItemAction(input: {
  itemId: string;
  planId: string;
  planDate: string;
  mealSlot: string;
  today: string;
}): Promise<MealPlanActionResult<{ item: MealPlanItemView }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await copyMealPlanItemForUser(authz.userId, input.itemId, {
    planDate: input.planDate,
    mealSlot: input.mealSlot,
    today: input.today,
  });
  if (result.ok) revalidateMealPlanner([input.planId]);
  return result;
}

export async function deleteMealPlanItemAction(input: {
  itemId: string;
  planId: string;
}): Promise<MealPlanActionResult> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await deleteMealPlanItemForUser(authz.userId, input.itemId);
  if (result.ok) revalidateMealPlanner([input.planId]);
  return result;
}

export async function reorderMealPlanItemsAction(input: {
  planId: string;
  planDate: string;
  mealSlot: string;
  orderedItemIds: string[];
}): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await reorderMealPlanItemsForUser(authz.userId, input);
  if (result.ok) revalidateMealPlanner([input.planId]);
  return result;
}

export async function moveMealPlanItemInSlotAction(input: {
  itemId: string;
  planId: string;
  direction: "up" | "down";
}): Promise<MealPlanActionResult<{ items: MealPlanItemView[] }>> {
  const authz = await requireMealPlannerMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await moveMealPlanItemInSlotForUser(
    authz.userId,
    input.itemId,
    input.direction,
  );
  if (result.ok) revalidateMealPlanner([input.planId]);
  return result;
}
