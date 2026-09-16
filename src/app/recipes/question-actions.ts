"use server";

import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isRecipeQaEnabled } from "@/lib/flags";
import {
  recipeQuestionSubmitMessage,
  type RecipeQuestionSubmitResult,
} from "@/lib/recipe-questions";
import {
  checkRecipeQuestionSubmitRateLimit,
  createRecipeQuestionForUser,
  findRecentDuplicateRecipeQuestion,
  normalizeRecipeQuestionAuthorNameForSubmit,
  normalizeRecipeQuestionBodyForSubmit,
} from "@/lib/recipe-questions-server";
import { getDb } from "@/lib/db";

function fail(
  status: Exclude<RecipeQuestionSubmitResult, { ok: true }>["status"],
  message?: string,
): RecipeQuestionSubmitResult {
  return {
    ok: false,
    status,
    message: message || recipeQuestionSubmitMessage(status),
  };
}

/**
 * Member Ask submission (Phase 9C).
 * Client may send only recipeId + body. Identity and authorName are server-derived.
 */
export async function submitRecipeQuestionAction(input: {
  recipeId: string;
  body: string;
}): Promise<RecipeQuestionSubmitResult> {
  try {
    if (!isRecipeQaEnabled()) return fail("FEATURE_DISABLED");

    const recipeId = typeof input?.recipeId === "string" ? input.recipeId.trim() : "";
    const rawBody = typeof input?.body === "string" ? input.body : "";
    if (!recipeId) return fail("RECIPE_UNAVAILABLE");

    const session = await auth();
    const email = session?.user?.email;
    if (
      !email ||
      session.error === "MemberDeleted" ||
      session.error === "SessionRevoked"
    ) {
      return fail("AUTH_REQUIRED");
    }

    const member = await findActiveMemberByEmail(email);
    if (!member) return fail("AUTH_REQUIRED");

    const bodyNorm = normalizeRecipeQuestionBodyForSubmit(rawBody);
    if (!bodyNorm.ok) return fail("VALIDATION_ERROR");

    const recipe = await getDb().recipe.findUnique({
      where: { id: recipeId },
      select: { id: true, status: true },
    });
    // Missing and Draft share one unavailable result (no existence leak).
    if (!recipe || recipe.status !== "published") return fail("RECIPE_UNAVAILABLE");

    const authorName = normalizeRecipeQuestionAuthorNameForSubmit(member.name || "");

    const duplicate = await findRecentDuplicateRecipeQuestion({
      userId: member.id,
      recipeId: recipe.id,
      body: bodyNorm.body,
    });
    if (duplicate) {
      return {
        ok: true,
        status: "SUCCESS",
        questionId: duplicate.id,
        reusedExisting: true,
      };
    }

    const rate = await checkRecipeQuestionSubmitRateLimit({
      userId: member.id,
      recipeId: recipe.id,
    });
    if (!rate.ok) return fail("RATE_LIMITED");

    const created = await createRecipeQuestionForUser({
      userId: member.id,
      recipeId: recipe.id,
      authorName,
      body: bodyNorm.body,
    });
    if (!created.ok) {
      if (
        created.error === "RECIPE_NOT_PUBLISHED" ||
        created.error === "NOT_FOUND"
      ) {
        return fail("RECIPE_UNAVAILABLE");
      }
      if (created.error === "INVALID_INPUT") return fail("VALIDATION_ERROR");
      return fail("FAILED");
    }

    return {
      ok: true,
      status: "SUCCESS",
      questionId: created.data.id,
    };
  } catch (error) {
    console.error("Recipe question submit failed", error);
    return fail("FAILED");
  }
}
