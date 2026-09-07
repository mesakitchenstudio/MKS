"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import type {
  RecipeCollectionPickerState,
  SavedRecipeCollectionActionResult,
} from "@/lib/saved-recipe-collections";
import {
  addSavedRecipeToCollectionForUser,
  countRecipeSaveCollectionMembershipsForUser,
  createCollectionAndAddRecipeForUser,
  createSavedRecipeCollectionForUser,
  deleteSavedRecipeCollectionForUser,
  findMemberRecipeSaveIdBySlug,
  getRecipeCollectionPickerStateForUser,
  removeSavedRecipeFromCollectionForUser,
  renameSavedRecipeCollectionForUser,
  setSavedRecipeCollectionMembershipsForUser,
} from "@/lib/saved-recipe-collections-server";

async function requireMemberUserId(): Promise<
  { ok: true; userId: string } | { ok: false; result: SavedRecipeCollectionActionResult<never> }
> {
  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session.error === "MemberDeleted" ||
    session.error === "SessionRevoked"
  ) {
    return {
      ok: false,
      result: { ok: false, error: "UNAUTHORIZED", message: "Sign in to manage collections." },
    };
  }
  const member = await findActiveMemberByEmail(email);
  if (!member) {
    return {
      ok: false,
      result: { ok: false, error: "UNAUTHORIZED", message: "Sign in to manage collections." },
    };
  }
  return { ok: true, userId: member.id };
}

function revalidateMemberLibrary(collectionIds?: string[]) {
  revalidatePath("/profile");
  for (const collectionId of collectionIds ?? []) {
    if (collectionId) revalidatePath(`/profile/collections/${collectionId}`);
  }
}

export async function createSavedRecipeCollectionAction(
  rawName: string,
): Promise<SavedRecipeCollectionActionResult<{ id: string; name: string }>> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await createSavedRecipeCollectionForUser(authz.userId, rawName);
  if (result.ok) revalidateMemberLibrary([result.data.id]);
  return result;
}

export async function renameSavedRecipeCollectionAction(
  collectionId: string,
  rawName: string,
): Promise<SavedRecipeCollectionActionResult<{ id: string; name: string }>> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await renameSavedRecipeCollectionForUser(
    authz.userId,
    collectionId,
    rawName,
  );
  if (result.ok) revalidateMemberLibrary([collectionId]);
  return result;
}

export async function deleteSavedRecipeCollectionAction(
  collectionId: string,
): Promise<SavedRecipeCollectionActionResult> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await deleteSavedRecipeCollectionForUser(authz.userId, collectionId);
  if (result.ok) revalidateMemberLibrary([collectionId]);
  return result;
}

export async function addSavedRecipeToCollectionAction(input: {
  collectionId: string;
  recipeSaveId?: string;
  /** Convenience: resolve save by slug for the signed-in member only. */
  recipeSlug?: string;
}): Promise<SavedRecipeCollectionActionResult<{ itemId: string }>> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;

  let recipeSaveId = String(input.recipeSaveId ?? "").trim();
  if (!recipeSaveId && input.recipeSlug) {
    recipeSaveId =
      (await findMemberRecipeSaveIdBySlug(authz.userId, input.recipeSlug)) || "";
  }
  if (!recipeSaveId) {
    return { ok: false, error: "NOT_SAVED", message: "That recipe is not in your saved recipes." };
  }

  const result = await addSavedRecipeToCollectionForUser(
    authz.userId,
    String(input.collectionId ?? "").trim(),
    recipeSaveId,
  );
  if (result.ok) revalidateMemberLibrary([input.collectionId]);
  return result;
}

export async function removeSavedRecipeFromCollectionAction(input: {
  collectionId: string;
  recipeSaveId: string;
}): Promise<SavedRecipeCollectionActionResult> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await removeSavedRecipeFromCollectionForUser(
    authz.userId,
    String(input.collectionId ?? "").trim(),
    String(input.recipeSaveId ?? "").trim(),
  );
  if (result.ok) revalidateMemberLibrary([input.collectionId]);
  return result;
}

export async function getRecipeCollectionPickerStateAction(input: {
  recipeId?: string;
  recipeSlug?: string;
}): Promise<SavedRecipeCollectionActionResult<RecipeCollectionPickerState>> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  return getRecipeCollectionPickerStateForUser(authz.userId, input);
}

export async function setSavedRecipeCollectionMembershipsAction(input: {
  recipeId?: string;
  recipeSlug?: string;
  collectionIds: string[];
}): Promise<
  SavedRecipeCollectionActionResult<{ selectedIds: string[]; changedCollectionIds: string[] }>
> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await setSavedRecipeCollectionMembershipsForUser(authz.userId, input);
  if (result.ok) {
    revalidateMemberLibrary(result.data.changedCollectionIds);
  }
  return result;
}

export async function createCollectionAndAddRecipeAction(input: {
  recipeId?: string;
  recipeSlug?: string;
  name: string;
}): Promise<
  SavedRecipeCollectionActionResult<{ id: string; name: string; selectedIds: string[] }>
> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  const result = await createCollectionAndAddRecipeForUser(authz.userId, input);
  if (result.ok) revalidateMemberLibrary([result.data.id]);
  return result;
}

export async function countSavedRecipeCollectionMembershipsAction(input: {
  recipeId?: string;
  recipeSlug?: string;
}): Promise<SavedRecipeCollectionActionResult<{ count: number; recipeSaveId: string }>> {
  const authz = await requireMemberUserId();
  if (!authz.ok) return authz.result;
  return countRecipeSaveCollectionMembershipsForUser(authz.userId, input);
}
