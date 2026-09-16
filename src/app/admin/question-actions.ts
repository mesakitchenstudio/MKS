"use server";

import { revalidatePath } from "next/cache";
import { actorFromAdminSession, recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isRecipeQaEnabled } from "@/lib/flags";
import {
  hideRecipeQuestion,
  publishRecipeQuestion,
  rejectRecipeQuestion,
  setRecipeQuestionAnswer,
} from "@/lib/recipe-questions-server";
import { sanitizePlainText } from "@/lib/user-content";
import { RECIPE_QUESTION_ANSWER_MAX } from "@/lib/recipe-questions";

export type AdminRecipeQuestionActionStatus =
  | "SUCCESS"
  | "FEATURE_DISABLED"
  | "NOT_FOUND"
  | "RECIPE_UNAVAILABLE"
  | "INVALID_STATE"
  | "VALIDATION_ERROR"
  | "FAILED";

export type AdminRecipeQuestionActionResult =
  | { ok: true; status: "SUCCESS"; message?: string }
  | {
      ok: false;
      status: Exclude<AdminRecipeQuestionActionStatus, "SUCCESS">;
      message: string;
    };

function fail(
  status: Exclude<AdminRecipeQuestionActionStatus, "SUCCESS">,
  message: string,
): AdminRecipeQuestionActionResult {
  return { ok: false, status, message };
}

function ok(message?: string): AdminRecipeQuestionActionResult {
  return { ok: true, status: "SUCCESS", message };
}

function gateOff() {
  return fail("FEATURE_DISABLED", "Recipe Q&A is not available.");
}

async function requireQaAdmin() {
  if (!isRecipeQaEnabled()) return { ok: false as const, result: gateOff() };
  const admin = await requireAccess("content");
  return { ok: true as const, admin };
}

function normalizeAnswerInput(raw: string) {
  const body = sanitizePlainText(raw, RECIPE_QUESTION_ANSWER_MAX);
  if (!body) return { ok: false as const };
  return { ok: true as const, body };
}

async function loadQuestionContext(questionId: string) {
  const id = questionId.trim();
  if (!id) return null;
  return getDb().recipeQuestion.findUnique({
    where: { id },
    select: {
      id: true,
      recipeId: true,
      status: true,
      answerBody: true,
      answeredAt: true,
      publishedAt: true,
      authorName: true,
      body: true,
      recipe: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
}

function revalidatePublicRecipe(slug: string) {
  const trimmed = slug.trim();
  if (!trimmed) return;
  revalidatePath(`/recipes/${trimmed}`);
}

function revalidateAdminQuestion(questionId: string) {
  revalidatePath("/admin/questions");
  revalidatePath(`/admin/questions/${questionId}`);
}

/**
 * Save official Mesa answer without changing status.
 * Pending stays pending; hidden stays hidden; rejected is refused.
 */
export async function saveRecipeQuestionAnswerAction(input: {
  questionId: string;
  answerBody: string;
}): Promise<AdminRecipeQuestionActionResult> {
  try {
    const authz = await requireQaAdmin();
    if (!authz.ok) return authz.result;

    const questionId = String(input?.questionId || "").trim();
    const answerNorm = normalizeAnswerInput(String(input?.answerBody || ""));
    if (!answerNorm.ok) {
      return fail(
        "VALIDATION_ERROR",
        `Answers must be between 1 and ${RECIPE_QUESTION_ANSWER_MAX} characters.`,
      );
    }

    const existing = await loadQuestionContext(questionId);
    if (!existing) return fail("NOT_FOUND", "Question not found.");
    if (existing.status === "rejected") {
      return fail("INVALID_STATE", "Rejected questions cannot be answered.");
    }

    const previousAnswer = existing.answerBody?.trim() || "";
    if (previousAnswer === answerNorm.body) {
      return ok("Answer unchanged.");
    }

    const result = await setRecipeQuestionAnswer({
      questionId: existing.id,
      adminId: authz.admin.id,
      answerBody: answerNorm.body,
    });
    if (!result.ok) {
      if (result.error === "REJECTED_TERMINAL") {
        return fail("INVALID_STATE", result.message);
      }
      if (result.error === "INVALID_INPUT") {
        return fail("VALIDATION_ERROR", result.message);
      }
      return fail("FAILED", "Could not save the answer.");
    }

    const auditAction = result.data.wasFirstAnswer
      ? "recipe_question.answered"
      : "recipe_question.answer_updated";
    await recordAdminAuditEvent({
      actor: actorFromAdminSession(authz.admin),
      action: auditAction,
      area: "content",
      entityType: "recipe_question",
      entityId: existing.id,
      entityLabel: existing.recipe.title || existing.id,
      entityPath: `/admin/questions/${existing.id}`,
      metadata: {
        questionId: existing.id,
        recipeId: existing.recipeId,
        previousStatus: existing.status,
      },
    });

    revalidateAdminQuestion(existing.id);
    // Public HTML changes only when already published (answer edit) or stays pending/hidden.
    if (existing.status === "published") {
      revalidatePublicRecipe(existing.recipe.slug);
    }

    return ok(
      result.data.wasFirstAnswer ? "Answer saved." : "Answer updated.",
    );
  } catch (error) {
    console.error("Admin recipe question answer failed", error);
    return fail("FAILED", "Could not save the answer.");
  }
}

/** Publish requires a valid answer and a currently Published Recipe. */
export async function publishRecipeQuestionAction(input: {
  questionId: string;
}): Promise<AdminRecipeQuestionActionResult> {
  try {
    const authz = await requireQaAdmin();
    if (!authz.ok) return authz.result;

    const questionId = String(input?.questionId || "").trim();
    const existing = await loadQuestionContext(questionId);
    if (!existing) return fail("NOT_FOUND", "Question not found.");
    if (existing.status === "rejected") {
      return fail("INVALID_STATE", "Rejected questions cannot be published.");
    }
    if (existing.status === "published") {
      return fail("INVALID_STATE", "This question is already published.");
    }
    if (!existing.answerBody?.trim()) {
      return fail(
        "VALIDATION_ERROR",
        "An official answer is required before publishing.",
      );
    }
    if (existing.recipe.status !== "published") {
      return fail(
        "RECIPE_UNAVAILABLE",
        "This question cannot be published while the recipe is unpublished.",
      );
    }

    const previousStatus = existing.status;
    const result = await publishRecipeQuestion({ questionId: existing.id });
    if (!result.ok) {
      if (result.error === "ANSWER_REQUIRED") {
        return fail("VALIDATION_ERROR", result.message);
      }
      if (result.error === "RECIPE_NOT_PUBLISHED") {
        return fail(
          "RECIPE_UNAVAILABLE",
          "This question cannot be published while the recipe is unpublished.",
        );
      }
      if (result.error === "REJECTED_TERMINAL") {
        return fail("INVALID_STATE", result.message);
      }
      return fail("FAILED", "Could not publish the question.");
    }

    await recordAdminAuditEvent({
      actor: actorFromAdminSession(authz.admin),
      action: "recipe_question.published",
      area: "content",
      entityType: "recipe_question",
      entityId: existing.id,
      entityLabel: existing.recipe.title || existing.id,
      entityPath: `/admin/questions/${existing.id}`,
      metadata: {
        questionId: existing.id,
        recipeId: existing.recipeId,
        previousStatus,
        nextStatus: "published",
      },
    });

    revalidateAdminQuestion(existing.id);
    revalidatePublicRecipe(existing.recipe.slug);
    return ok("Question published.");
  } catch (error) {
    console.error("Admin recipe question publish failed", error);
    return fail("FAILED", "Could not publish the question.");
  }
}

/** Save answer then publish (emits answered/updated + published audits when each applies). */
export async function saveAndPublishRecipeQuestionAction(input: {
  questionId: string;
  answerBody: string;
}): Promise<AdminRecipeQuestionActionResult> {
  const saved = await saveRecipeQuestionAnswerAction({
    questionId: input.questionId,
    answerBody: input.answerBody,
  });
  if (!saved.ok) return saved;
  return publishRecipeQuestionAction({ questionId: input.questionId });
}

export async function hideRecipeQuestionAction(input: {
  questionId: string;
}): Promise<AdminRecipeQuestionActionResult> {
  try {
    const authz = await requireQaAdmin();
    if (!authz.ok) return authz.result;

    const questionId = String(input?.questionId || "").trim();
    const existing = await loadQuestionContext(questionId);
    if (!existing) return fail("NOT_FOUND", "Question not found.");
    if (existing.status === "hidden") {
      return fail("INVALID_STATE", "This question is already hidden.");
    }
    if (existing.status !== "published") {
      return fail("INVALID_STATE", "Only published questions can be hidden.");
    }

    const result = await hideRecipeQuestion({ questionId: existing.id });
    if (!result.ok) {
      return fail("INVALID_STATE", result.message);
    }

    await recordAdminAuditEvent({
      actor: actorFromAdminSession(authz.admin),
      action: "recipe_question.hidden",
      area: "content",
      entityType: "recipe_question",
      entityId: existing.id,
      entityLabel: existing.recipe.title || existing.id,
      entityPath: `/admin/questions/${existing.id}`,
      metadata: {
        questionId: existing.id,
        recipeId: existing.recipeId,
        previousStatus: "published",
        nextStatus: "hidden",
      },
    });

    revalidateAdminQuestion(existing.id);
    revalidatePublicRecipe(existing.recipe.slug);
    return ok("Question hidden from the public recipe page.");
  } catch (error) {
    console.error("Admin recipe question hide failed", error);
    return fail("FAILED", "Could not hide the question.");
  }
}

export async function rejectRecipeQuestionAction(input: {
  questionId: string;
}): Promise<AdminRecipeQuestionActionResult> {
  try {
    const authz = await requireQaAdmin();
    if (!authz.ok) return authz.result;

    const questionId = String(input?.questionId || "").trim();
    const existing = await loadQuestionContext(questionId);
    if (!existing) return fail("NOT_FOUND", "Question not found.");
    if (existing.status === "rejected") {
      return fail("INVALID_STATE", "This question is already rejected.");
    }
    if (existing.status !== "pending") {
      return fail(
        "INVALID_STATE",
        "Only pending questions can be rejected. Hide published questions instead.",
      );
    }

    const result = await rejectRecipeQuestion({ questionId: existing.id });
    if (!result.ok) {
      return fail("FAILED", "Could not reject the question.");
    }

    await recordAdminAuditEvent({
      actor: actorFromAdminSession(authz.admin),
      action: "recipe_question.rejected",
      area: "content",
      entityType: "recipe_question",
      entityId: existing.id,
      entityLabel: existing.recipe.title || existing.id,
      entityPath: `/admin/questions/${existing.id}`,
      metadata: {
        questionId: existing.id,
        recipeId: existing.recipeId,
        previousStatus: "pending",
        nextStatus: "rejected",
      },
    });

    revalidateAdminQuestion(existing.id);
    // Rejected pending never affected public HTML — no recipe revalidation.
    return ok("Question rejected.");
  } catch (error) {
    console.error("Admin recipe question reject failed", error);
    return fail("FAILED", "Could not reject the question.");
  }
}
