"use server";

import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isRecipeQaEnabled } from "@/lib/flags";
import {
  RECIPE_QUESTION_BODY_MAX,
  RECIPE_QUESTION_BODY_MIN,
  recipeQuestionProfileActionMessage,
  type RecipeQuestionProfileActionResult,
} from "@/lib/recipe-questions";
import {
  deletePendingRecipeQuestionForUser,
  normalizeRecipeQuestionBodyForSubmit,
  updatePendingRecipeQuestionForUser,
} from "@/lib/recipe-questions-server";

function fail(
  status: Exclude<RecipeQuestionProfileActionResult["status"], "SUCCESS">,
  message?: string,
): RecipeQuestionProfileActionResult {
  return {
    ok: false,
    status,
    message: message || recipeQuestionProfileActionMessage(status),
  };
}

function ok(message?: string): RecipeQuestionProfileActionResult {
  return { ok: true, status: "SUCCESS", message };
}

async function requireActiveQaMember() {
  if (!isRecipeQaEnabled()) return { ok: false as const, result: fail("FEATURE_DISABLED") };
  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session?.error === "MemberDeleted" ||
    session?.error === "SessionRevoked"
  ) {
    return { ok: false as const, result: fail("AUTH_REQUIRED") };
  }
  const member = await findActiveMemberByEmail(email);
  if (!member) return { ok: false as const, result: fail("AUTH_REQUIRED") };
  return { ok: true as const, userId: member.id };
}

/** Owner-scoped pending question edit. Never accepts client userId. */
export async function updateMyRecipeQuestionAction(input: {
  questionId: string;
  body: string;
}): Promise<RecipeQuestionProfileActionResult> {
  try {
    const authz = await requireActiveQaMember();
    if (!authz.ok) return authz.result;

    const questionId = String(input?.questionId || "").trim();
    if (!questionId) return fail("NOT_FOUND");

    const bodyNorm = normalizeRecipeQuestionBodyForSubmit(String(input?.body || ""));
    if (!bodyNorm.ok) {
      return fail(
        "VALIDATION_ERROR",
        `Questions must be between ${RECIPE_QUESTION_BODY_MIN} and ${RECIPE_QUESTION_BODY_MAX} characters.`,
      );
    }

    const result = await updatePendingRecipeQuestionForUser({
      userId: authz.userId,
      questionId,
      body: bodyNorm.body,
    });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") return fail("NOT_FOUND");
      if (result.error === "ANSWER_IN_PROGRESS") return fail("ANSWER_IN_PROGRESS");
      if (result.error === "NOT_EDITABLE") return fail("INVALID_STATE");
      if (result.error === "INVALID_INPUT") return fail("VALIDATION_ERROR", result.message);
      return fail("FAILED");
    }
    return ok("Question updated.");
  } catch (error) {
    console.error("Member recipe question edit failed", error);
    return fail("FAILED");
  }
}

/** Owner-scoped pending question delete. Never accepts client userId. */
export async function deleteMyRecipeQuestionAction(input: {
  questionId: string;
}): Promise<RecipeQuestionProfileActionResult> {
  try {
    const authz = await requireActiveQaMember();
    if (!authz.ok) return authz.result;

    const questionId = String(input?.questionId || "").trim();
    if (!questionId) return fail("NOT_FOUND");

    const result = await deletePendingRecipeQuestionForUser({
      userId: authz.userId,
      questionId,
    });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") return fail("NOT_FOUND");
      if (result.error === "ANSWER_IN_PROGRESS") return fail("ANSWER_IN_PROGRESS");
      if (result.error === "NOT_DELETABLE") {
        return fail("INVALID_STATE", result.message);
      }
      return fail("FAILED");
    }
    return ok("Question deleted.");
  } catch (error) {
    console.error("Member recipe question delete failed", error);
    return fail("FAILED");
  }
}
