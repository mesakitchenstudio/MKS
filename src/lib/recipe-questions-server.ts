/**
 * Roadmap #9B — trusted Recipe Q&A persistence helpers.
 *
 * Accept trusted `userId` / `adminId` for composition/tests.
 * Phase 9C–9E product actions MUST derive identity from auth session —
 * never accept client-supplied userId.
 *
 * No AdminAuditEvent, revalidatePath, or MemberNotification side effects here.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  RECIPE_QUESTION_ANSWER_MAX,
  RECIPE_QUESTION_AUTHOR_NAME_FALLBACK,
  RECIPE_QUESTION_AUTHOR_NAME_MAX,
  RECIPE_QUESTION_BODY_MAX,
  RECIPE_QUESTION_BODY_MIN,
  RECIPE_QUESTION_FORMER_MEMBER_AUTHOR_NAME,
  clampRecipeQuestionAdminLimit,
  clampRecipeQuestionProfileLimit,
  clampRecipeQuestionPublicLimit,
  isPubliclyVisibleRecipeQuestion,
  isRecipeQuestionStatus,
  recipeQuestionErrorMessage,
  type AdminRecipeQuestionListItem,
  type ProfileRecipeQuestionItem,
  type PublicRecipeQuestionItem,
  type RecipeQuestionActionResult,
  type RecipeQuestionError,
  type RecipeQuestionStatus,
} from "@/lib/recipe-questions";
import { sanitizePlainText } from "@/lib/user-content";

type DbClient = PrismaClient | Prisma.TransactionClient;

function fail(
  error: RecipeQuestionError,
  message?: string,
): RecipeQuestionActionResult<never> {
  return { ok: false, error, message: message || recipeQuestionErrorMessage(error) };
}

function okData<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function normalizeAuthorName(raw: string): string {
  const name = sanitizePlainText(raw, RECIPE_QUESTION_AUTHOR_NAME_MAX);
  return name.length >= 1 ? name : RECIPE_QUESTION_AUTHOR_NAME_FALLBACK;
}

function normalizeQuestionBody(raw: string): { ok: true; body: string } | { ok: false } {
  const body = sanitizePlainText(raw, RECIPE_QUESTION_BODY_MAX);
  if (body.length < RECIPE_QUESTION_BODY_MIN) return { ok: false };
  return { ok: true, body };
}

function normalizeAnswerBody(raw: string): { ok: true; body: string } | { ok: false } {
  const body = sanitizePlainText(raw, RECIPE_QUESTION_ANSWER_MAX);
  if (!body) return { ok: false };
  return { ok: true, body };
}

export type CreatedRecipeQuestion = {
  id: string;
  recipeId: string;
  userId: string;
  authorName: string;
  body: string;
  status: "pending";
  createdAt: Date;
};

/** Create a pending question for a published Recipe. */
export async function createRecipeQuestionForUser(input: {
  userId: string;
  recipeId: string;
  authorName: string;
  body: string;
}): Promise<RecipeQuestionActionResult<CreatedRecipeQuestion>> {
  const userId = input.userId.trim();
  const recipeId = input.recipeId.trim();
  if (!userId || !recipeId) return fail("INVALID_INPUT");

  const bodyNorm = normalizeQuestionBody(input.body);
  if (!bodyNorm.ok) {
    return fail(
      "INVALID_INPUT",
      `Questions must be between ${RECIPE_QUESTION_BODY_MIN} and ${RECIPE_QUESTION_BODY_MAX} characters.`,
    );
  }
  const authorName = normalizeAuthorName(input.authorName);

  const db = getDb();
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { id: true, status: true },
  });
  if (!recipe) return fail("NOT_FOUND", "Recipe not found.");
  if (recipe.status !== "published") return fail("RECIPE_NOT_PUBLISHED");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return fail("NOT_FOUND", "Member not found.");

  const row = await db.recipeQuestion.create({
    data: {
      recipeId: recipe.id,
      userId: user.id,
      authorName,
      body: bodyNorm.body,
      status: "pending",
    },
    select: {
      id: true,
      recipeId: true,
      userId: true,
      authorName: true,
      body: true,
      status: true,
      createdAt: true,
    },
  });

  return okData({
    id: row.id,
    recipeId: row.recipeId,
    userId: row.userId!,
    authorName: row.authorName,
    body: row.body,
    status: "pending",
    createdAt: row.createdAt,
  });
}

/** Member may edit only own pending questions. */
export async function updatePendingRecipeQuestionForUser(input: {
  userId: string;
  questionId: string;
  body: string;
}): Promise<RecipeQuestionActionResult<{ id: string; body: string }>> {
  const userId = input.userId.trim();
  const questionId = input.questionId.trim();
  if (!userId || !questionId) return fail("INVALID_INPUT");

  const bodyNorm = normalizeQuestionBody(input.body);
  if (!bodyNorm.ok) {
    return fail(
      "INVALID_INPUT",
      `Questions must be between ${RECIPE_QUESTION_BODY_MIN} and ${RECIPE_QUESTION_BODY_MAX} characters.`,
    );
  }

  const db = getDb();
  const existing = await db.recipeQuestion.findFirst({
    where: { id: questionId, userId },
    select: { id: true, status: true },
  });
  if (!existing) return fail("NOT_FOUND");
  if (existing.status !== "pending") return fail("NOT_EDITABLE");

  const row = await db.recipeQuestion.update({
    where: { id: existing.id },
    data: { body: bodyNorm.body },
    select: { id: true, body: true },
  });
  return okData(row);
}

/** Member may delete only own pending questions. */
export async function deletePendingRecipeQuestionForUser(input: {
  userId: string;
  questionId: string;
}): Promise<RecipeQuestionActionResult> {
  const userId = input.userId.trim();
  const questionId = input.questionId.trim();
  if (!userId || !questionId) return fail("INVALID_INPUT");

  const db = getDb();
  const existing = await db.recipeQuestion.findFirst({
    where: { id: questionId, userId },
    select: { id: true, status: true },
  });
  if (!existing) return fail("NOT_FOUND");
  if (existing.status !== "pending") return fail("NOT_DELETABLE");

  await db.recipeQuestion.delete({ where: { id: existing.id } });
  return { ok: true };
}

export type AnsweredRecipeQuestion = {
  id: string;
  answerBody: string;
  answeredAt: Date;
  answeredByAdminId: string;
  wasFirstAnswer: boolean;
};

/**
 * Set or update the official Mesa answer.
 * answeredAt is set only on first answer; answer edits preserve it.
 * answeredByAdminId reflects the latest staff member who authored/updated the answer.
 */
export async function setRecipeQuestionAnswer(input: {
  questionId: string;
  adminId: string;
  answerBody: string;
}): Promise<RecipeQuestionActionResult<AnsweredRecipeQuestion>> {
  const questionId = input.questionId.trim();
  const adminId = input.adminId.trim();
  if (!questionId || !adminId) return fail("INVALID_INPUT");

  const answerNorm = normalizeAnswerBody(input.answerBody);
  if (!answerNorm.ok) {
    return fail(
      "INVALID_INPUT",
      `Answers must be between 1 and ${RECIPE_QUESTION_ANSWER_MAX} characters.`,
    );
  }

  const db = getDb();
  const existing = await db.recipeQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      status: true,
      answeredAt: true,
      answerBody: true,
    },
  });
  if (!existing) return fail("NOT_FOUND");
  if (existing.status === "rejected") return fail("REJECTED_TERMINAL");

  const admin = await db.admin.findUnique({
    where: { id: adminId },
    select: { id: true },
  });
  if (!admin) return fail("NOT_FOUND", "Staff account not found.");

  const wasFirstAnswer = !existing.answeredAt;
  const answeredAt = existing.answeredAt ?? new Date();

  const row = await db.recipeQuestion.update({
    where: { id: existing.id },
    data: {
      answerBody: answerNorm.body,
      answeredAt,
      answeredByAdminId: admin.id,
    },
    select: {
      id: true,
      answerBody: true,
      answeredAt: true,
      answeredByAdminId: true,
    },
  });

  return okData({
    id: row.id,
    answerBody: row.answerBody!,
    answeredAt: row.answeredAt!,
    answeredByAdminId: row.answeredByAdminId!,
    wasFirstAnswer,
  });
}

export type PublishedRecipeQuestion = {
  id: string;
  status: "published";
  publishedAt: Date;
  answerBody: string;
};

/** Publish requires a valid answer and a currently Published Recipe. */
export async function publishRecipeQuestion(input: {
  questionId: string;
}): Promise<RecipeQuestionActionResult<PublishedRecipeQuestion>> {
  const questionId = input.questionId.trim();
  if (!questionId) return fail("INVALID_INPUT");

  const db = getDb();
  const existing = await db.recipeQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      status: true,
      answerBody: true,
      publishedAt: true,
      recipe: { select: { id: true, status: true } },
    },
  });
  if (!existing) return fail("NOT_FOUND");
  if (existing.status === "rejected") return fail("REJECTED_TERMINAL");
  if (!existing.answerBody || !existing.answerBody.trim()) return fail("ANSWER_REQUIRED");
  if (existing.recipe.status !== "published") return fail("RECIPE_NOT_PUBLISHED");

  const publishedAt = existing.publishedAt ?? new Date();
  const row = await db.recipeQuestion.update({
    where: { id: existing.id },
    data: {
      status: "published",
      publishedAt,
    },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      answerBody: true,
    },
  });

  return okData({
    id: row.id,
    status: "published",
    publishedAt: row.publishedAt!,
    answerBody: row.answerBody!,
  });
}

export async function hideRecipeQuestion(input: {
  questionId: string;
}): Promise<RecipeQuestionActionResult<{ id: string; status: "hidden" }>> {
  const questionId = input.questionId.trim();
  if (!questionId) return fail("INVALID_INPUT");

  const db = getDb();
  const existing = await db.recipeQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, status: true },
  });
  if (!existing) return fail("NOT_FOUND");
  if (existing.status === "rejected") return fail("REJECTED_TERMINAL");
  // Allowed: published → hidden (hidden is idempotent). Not pending → hidden.
  if (existing.status !== "published" && existing.status !== "hidden") {
    return fail("NOT_EDITABLE", "Only published questions can be hidden.");
  }

  const row = await db.recipeQuestion.update({
    where: { id: existing.id },
    data: { status: "hidden" },
    select: { id: true, status: true },
  });
  return okData({ id: row.id, status: "hidden" });
}

export async function rejectRecipeQuestion(input: {
  questionId: string;
}): Promise<RecipeQuestionActionResult<{ id: string; status: "rejected" }>> {
  const questionId = input.questionId.trim();
  if (!questionId) return fail("INVALID_INPUT");

  const db = getDb();
  const existing = await db.recipeQuestion.findUnique({
    where: { id: questionId },
    select: { id: true },
  });
  if (!existing) return fail("NOT_FOUND");

  const row = await db.recipeQuestion.update({
    where: { id: existing.id },
    data: { status: "rejected" },
    select: { id: true, status: true },
  });
  return okData({ id: row.id, status: "rejected" });
}

/** Public presentation — published + answered only. Newest answered first. */
export async function listPublishedRecipeQuestions(input: {
  recipeId: string;
  limit?: number;
}): Promise<PublicRecipeQuestionItem[]> {
  const recipeId = input.recipeId.trim();
  if (!recipeId) return [];
  const take = clampRecipeQuestionPublicLimit(input.limit);
  const db = getDb();

  const rows = await db.recipeQuestion.findMany({
    where: {
      recipeId,
      status: "published",
      answerBody: { not: null },
    },
    orderBy: [{ answeredAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      authorName: true,
      body: true,
      status: true,
      answerBody: true,
      answeredAt: true,
      publishedAt: true,
    },
  });

  return rows
    .filter((row) => isPubliclyVisibleRecipeQuestion(row))
    .filter((row) => row.answeredAt && row.publishedAt && row.answerBody)
    .map((row) => ({
      id: row.id,
      authorName: row.authorName,
      body: row.body,
      answerBody: row.answerBody!,
      answeredAt: row.answeredAt!,
      publishedAt: row.publishedAt!,
    }));
}

/** Profile history — own questions only, newest submitted first. */
export async function listRecipeQuestionsForUser(input: {
  userId: string;
  limit?: number;
}): Promise<ProfileRecipeQuestionItem[]> {
  const userId = input.userId.trim();
  if (!userId) return [];
  const take = clampRecipeQuestionProfileLimit(input.limit);
  const db = getDb();

  const rows = await db.recipeQuestion.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      recipeId: true,
      body: true,
      status: true,
      answerBody: true,
      createdAt: true,
      answeredAt: true,
      publishedAt: true,
      recipe: { select: { slug: true, title: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipeId,
    recipeSlug: row.recipe?.slug ?? null,
    recipeTitle: row.recipe?.title ?? null,
    body: row.body,
    status: (isRecipeQuestionStatus(row.status) ? row.status : "pending") as RecipeQuestionStatus,
    hasAnswer: Boolean(row.answerBody && row.answerBody.trim()),
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
    publishedAt: row.publishedAt,
  }));
}

/** Admin moderation queue foundation. */
export async function listRecipeQuestionsForAdmin(input?: {
  status?: RecipeQuestionStatus;
  limit?: number;
}): Promise<AdminRecipeQuestionListItem[]> {
  const take = clampRecipeQuestionAdminLimit(input?.limit);
  const where: Prisma.RecipeQuestionWhereInput = {};
  if (input?.status) where.status = input.status;

  const db = getDb();
  const rows = await db.recipeQuestion.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      recipeId: true,
      authorName: true,
      userId: true,
      body: true,
      status: true,
      answerBody: true,
      createdAt: true,
      answeredAt: true,
      publishedAt: true,
      updatedAt: true,
      recipe: { select: { slug: true, title: true, status: true } },
      user: { select: { name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipeId,
    recipeSlug: row.recipe.slug,
    recipeTitle: row.recipe.title,
    recipeStatus: row.recipe.status,
    authorName: row.authorName,
    userId: row.userId,
    memberName: row.user?.name ?? null,
    memberEmail: row.user?.email ?? null,
    body: row.body,
    status: (isRecipeQuestionStatus(row.status) ? row.status : "pending") as RecipeQuestionStatus,
    hasAnswer: Boolean(row.answerBody && row.answerBody.trim()),
    answerBody: row.answerBody,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getRecipeQuestionForAdmin(
  questionId: string,
): Promise<AdminRecipeQuestionListItem | null> {
  const id = questionId.trim();
  if (!id) return null;

  const db = getDb();
  const row = await db.recipeQuestion.findUnique({
    where: { id },
    select: {
      id: true,
      recipeId: true,
      authorName: true,
      userId: true,
      body: true,
      status: true,
      answerBody: true,
      createdAt: true,
      answeredAt: true,
      publishedAt: true,
      updatedAt: true,
      recipe: { select: { slug: true, title: true, status: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    recipeId: row.recipeId,
    recipeSlug: row.recipe.slug,
    recipeTitle: row.recipe.title,
    recipeStatus: row.recipe.status,
    authorName: row.authorName,
    userId: row.userId,
    memberName: row.user?.name ?? null,
    memberEmail: row.user?.email ?? null,
    body: row.body,
    status: (isRecipeQuestionStatus(row.status) ? row.status : "pending") as RecipeQuestionStatus,
    hasAnswer: Boolean(row.answerBody && row.answerBody.trim()),
    answerBody: row.answerBody,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

export async function countPendingRecipeQuestions(): Promise<number> {
  const db = getDb();
  return db.recipeQuestion.count({ where: { status: "pending" } });
}

/**
 * Account-deletion cleanup for Recipe Q&A.
 * Call inside the same transaction as User deletion when possible.
 *
 * published → anonymize authorName, keep row (userId SetNull on delete)
 * pending / hidden / rejected → delete
 */
export async function cleanupRecipeQuestionsForUserDeletion(
  db: DbClient,
  userId: string,
): Promise<void> {
  const id = userId.trim();
  if (!id) return;

  await db.recipeQuestion.updateMany({
    where: { userId: id, status: "published" },
    data: { authorName: RECIPE_QUESTION_FORMER_MEMBER_AUTHOR_NAME },
  });

  await db.recipeQuestion.deleteMany({
    where: {
      userId: id,
      status: { in: ["pending", "hidden", "rejected"] },
    },
  });
}
