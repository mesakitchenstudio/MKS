/**
 * Roadmap #9B — Recipe Q&A domain (pure helpers + types).
 * Persistence: recipe-questions-server.ts (trusted userId / adminId composition).
 * Product actions (9C–9E) must derive identity from auth session — never client.
 */

export const RECIPE_QUESTION_STATUSES = [
  "pending",
  "published",
  "hidden",
  "rejected",
] as const;

export type RecipeQuestionStatus = (typeof RECIPE_QUESTION_STATUSES)[number];

export function isRecipeQuestionStatus(value: unknown): value is RecipeQuestionStatus {
  return (
    typeof value === "string" &&
    (RECIPE_QUESTION_STATUSES as readonly string[]).includes(value)
  );
}

/** Public Q&A requires published status AND a non-empty answer. */
export function isPubliclyVisibleRecipeQuestion(row: {
  status: string;
  answerBody: string | null | undefined;
}): boolean {
  if (row.status !== "published") return false;
  return Boolean(row.answerBody && row.answerBody.trim());
}

export const RECIPE_QUESTION_BODY_MIN = 10;
export const RECIPE_QUESTION_BODY_MAX = 1000;
export const RECIPE_QUESTION_ANSWER_MAX = 4000;
export const RECIPE_QUESTION_AUTHOR_NAME_MAX = 80;
export const RECIPE_QUESTION_AUTHOR_NAME_FALLBACK = "Mesa member";
/** Retained public Q&A after account deletion — never email/PII. */
export const RECIPE_QUESTION_FORMER_MEMBER_AUTHOR_NAME = "Former member";

export const RECIPE_QUESTION_PUBLIC_LIST_DEFAULT_LIMIT = 10;
export const RECIPE_QUESTION_PUBLIC_LIST_MAX_LIMIT = 50;
export const RECIPE_QUESTION_ADMIN_LIST_DEFAULT_LIMIT = 40;
export const RECIPE_QUESTION_ADMIN_LIST_MAX_LIMIT = 100;
export const RECIPE_QUESTION_PROFILE_LIST_DEFAULT_LIMIT = 50;
export const RECIPE_QUESTION_PROFILE_LIST_MAX_LIMIT = 100;

/** Soft anti-spam: minimum gap between questions on the same Recipe (same member). */
export const RECIPE_QUESTION_PER_RECIPE_COOLDOWN_MS = 2 * 60 * 1000;
/** Soft anti-spam: max questions per member in a rolling 24h window (all statuses). */
export const RECIPE_QUESTION_GLOBAL_DAILY_MAX = 10;
export const RECIPE_QUESTION_GLOBAL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Soft double-submit: identical normalized body on same Recipe within this window. */
export const RECIPE_QUESTION_DUPLICATE_WINDOW_MS = 60 * 1000;

/** Future 9E semantic key — do not create notifications in 9B. */
export function buildRecipeQuestionAnsweredDedupeKey(questionId: string): string {
  return `recipe_question.answered:${questionId.trim()}`;
}

export const RECIPE_QUESTION_ERRORS = [
  "FEATURE_DISABLED",
  "NOT_AUTHENTICATED",
  "NOT_FOUND",
  "INVALID_INPUT",
  "RECIPE_NOT_PUBLISHED",
  "NOT_EDITABLE",
  "NOT_DELETABLE",
  "ANSWER_REQUIRED",
  "REJECTED_TERMINAL",
] as const;

export type RecipeQuestionError = (typeof RECIPE_QUESTION_ERRORS)[number];

export type RecipeQuestionActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: RecipeQuestionError; message: string };

export function recipeQuestionErrorMessage(error: RecipeQuestionError): string {
  switch (error) {
    case "FEATURE_DISABLED":
      return "Recipe Q&A is not available.";
    case "NOT_AUTHENTICATED":
      return "Sign in to ask a question.";
    case "NOT_FOUND":
      return "Question not found.";
    case "INVALID_INPUT":
      return "Invalid question request.";
    case "RECIPE_NOT_PUBLISHED":
      return "Questions can only be asked on published recipes.";
    case "NOT_EDITABLE":
      return "This question can no longer be edited.";
    case "NOT_DELETABLE":
      return "This question can no longer be deleted.";
    case "ANSWER_REQUIRED":
      return "An official answer is required before publishing.";
    case "REJECTED_TERMINAL":
      return "Rejected questions cannot be answered or published.";
    default:
      return "Something went wrong.";
  }
}

export type PublicRecipeQuestionItem = {
  id: string;
  authorName: string;
  body: string;
  answerBody: string;
  answeredAt: Date;
  publishedAt: Date;
};

export type ProfileRecipeQuestionItem = {
  id: string;
  recipeId: string;
  recipeSlug: string | null;
  recipeTitle: string | null;
  body: string;
  status: RecipeQuestionStatus;
  hasAnswer: boolean;
  createdAt: Date;
  answeredAt: Date | null;
  publishedAt: Date | null;
};

export type AdminRecipeQuestionListItem = {
  id: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  recipeStatus: string;
  authorName: string;
  userId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  body: string;
  status: RecipeQuestionStatus;
  hasAnswer: boolean;
  answerBody: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export function clampRecipeQuestionPublicLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return RECIPE_QUESTION_PUBLIC_LIST_DEFAULT_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, RECIPE_QUESTION_PUBLIC_LIST_MAX_LIMIT);
}

export function clampRecipeQuestionAdminLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return RECIPE_QUESTION_ADMIN_LIST_DEFAULT_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, RECIPE_QUESTION_ADMIN_LIST_MAX_LIMIT);
}

export function clampRecipeQuestionProfileLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return RECIPE_QUESTION_PROFILE_LIST_DEFAULT_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, RECIPE_QUESTION_PROFILE_LIST_MAX_LIMIT);
}

/** Phase 9C member submission action result codes (product-facing). */
export const RECIPE_QUESTION_SUBMIT_STATUSES = [
  "SUCCESS",
  "AUTH_REQUIRED",
  "FEATURE_DISABLED",
  "RECIPE_UNAVAILABLE",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "FAILED",
] as const;

export type RecipeQuestionSubmitStatus = (typeof RECIPE_QUESTION_SUBMIT_STATUSES)[number];

export type RecipeQuestionSubmitResult =
  | { ok: true; status: "SUCCESS"; questionId: string; reusedExisting?: boolean }
  | {
      ok: false;
      status: Exclude<RecipeQuestionSubmitStatus, "SUCCESS">;
      message: string;
    };

export function recipeQuestionSubmitMessage(
  status: Exclude<RecipeQuestionSubmitStatus, "SUCCESS">,
): string {
  switch (status) {
    case "AUTH_REQUIRED":
      return "Sign in to ask a question.";
    case "FEATURE_DISABLED":
      return "Recipe Q&A is not available.";
    case "RECIPE_UNAVAILABLE":
      return "Questions are not available for this recipe.";
    case "VALIDATION_ERROR":
      return `Questions must be between ${RECIPE_QUESTION_BODY_MIN} and ${RECIPE_QUESTION_BODY_MAX} characters.`;
    case "RATE_LIMITED":
      return "Please wait before submitting another question.";
    case "FAILED":
    default:
      return "Could not submit your question. Please try again.";
  }
}
