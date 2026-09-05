import { getStaffByEmail } from "@/lib/accounts";
import { canAccess, type AccessLevel } from "@/lib/admin-access";
import { getDb } from "@/lib/db";
import { site } from "@/data/site";
import { sanitizePlainText, validateReviewInput } from "@/lib/user-content";

/** Owner/Editor may reply to any recipe review conversation. */
export function canManageRecipeReviewReplies(
  role: AccessLevel | string | null | undefined,
): role is AccessLevel {
  return Boolean(role && canAccess(role, "content"));
}

/** True when the viewer is the original review author (session-derived ids/email only). */
export function isRecipeReviewAuthor(
  review: { userId?: string | null; authorEmail: string },
  viewer: { userId?: string | null; email?: string | null },
) {
  const viewerEmail = viewer.email?.trim().toLowerCase() || "";
  const authorEmail = review.authorEmail.trim().toLowerCase();
  if (viewerEmail && authorEmail && viewerEmail === authorEmail) return true;
  if (viewer.userId && review.userId && viewer.userId === review.userId) return true;
  return false;
}

export type RecipeReviewViewer = {
  email?: string | null;
  userId?: string | null;
  /** Content-role admin cookie or NextAuth staffRole. */
  canStaffReply?: boolean;
};

export function canReplyToRecipeReview(
  review: { userId?: string | null; authorEmail: string },
  viewer: RecipeReviewViewer | null | undefined,
) {
  if (!viewer) return false;
  if (viewer.canStaffReply) return true;
  return isRecipeReviewAuthor(review, viewer);
}

export type RecipeReviewReplyRow = {
  id: string;
  authorName: string;
  authorTitle: string;
  authorPhotoUrl: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
};

export type RecipeReviewRow = {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
  replies: RecipeReviewReplyRow[];
};

export type RecipeReviewStats = {
  average: number;
  count: number;
};

export type RecipeReviewData = {
  reviews: RecipeReviewRow[];
  stats: RecipeReviewStats;
  /** Review ids the current viewer may continue (author or staff). */
  replyableReviewIds: string[];
};

function emptyReviewData(): RecipeReviewData {
  return { reviews: [], stats: { average: 0, count: 0 }, replyableReviewIds: [] };
}

function toReplyRow(reply: {
  id: string;
  authorName: string;
  authorTitle: string;
  authorPhotoUrl: string;
  body: string;
  isStaff: boolean;
  createdAt: Date;
}): RecipeReviewReplyRow {
  return {
    id: reply.id,
    authorName: reply.authorName,
    authorTitle: reply.authorTitle,
    authorPhotoUrl: reply.authorPhotoUrl || "",
    body: reply.body,
    isStaff: reply.isStaff,
    createdAt: reply.createdAt.toISOString(),
  };
}

function toRow(review: {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: Date;
  replies: {
    id: string;
    authorName: string;
    authorTitle: string;
    authorPhotoUrl: string;
    body: string;
    isStaff: boolean;
    createdAt: Date;
  }[];
}): RecipeReviewRow {
  return {
    id: review.id,
    authorName: review.authorName,
    rating: review.rating,
    body: review.body,
    createdAt: review.createdAt.toISOString(),
    replies: review.replies.map(toReplyRow),
  };
}

export async function getRecipeReviewData(
  recipeSlug: string,
  viewer?: RecipeReviewViewer | null,
): Promise<RecipeReviewData> {
  try {
    const db = getDb();
    const reviews = await db.recipeReview.findMany({
      where: { recipeSlug },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        authorEmail: true,
        authorName: true,
        rating: true,
        body: true,
        createdAt: true,
        replies: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            authorName: true,
            authorTitle: true,
            authorPhotoUrl: true,
            body: true,
            isStaff: true,
            createdAt: true,
          },
        },
      },
    });

    if (!reviews.length) return emptyReviewData();

    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    const replyableReviewIds = reviews
      .filter((review) => canReplyToRecipeReview(review, viewer))
      .map((review) => review.id);

    return {
      reviews: reviews.map(toRow),
      stats: {
        average: Math.round((total / reviews.length) * 10) / 10,
        count: reviews.length,
      },
      replyableReviewIds,
    };
  } catch (error) {
    console.error("getRecipeReviewData failed", recipeSlug, error);
    return emptyReviewData();
  }
}

export async function submitRecipeReview(input: {
  recipeSlug: string;
  authorName: string;
  authorEmail: string;
  rating: number;
  body: string;
  userId?: string | null;
}) {
  const db = getDb();
  const { authorName, authorEmail, body } = validateReviewInput({
    authorName: input.authorName,
    authorEmail: input.authorEmail,
    body: input.body,
    minBodyLength: 10,
  });

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("Choose a rating from 1 to 5 stars.");
  }

  try {
    const recipe = await db.recipe.findUnique({
      where: { slug: input.recipeSlug },
      select: { slug: true, status: true },
    });
    if (!recipe || recipe.status !== "published") {
      throw new Error("Recipe not found.");
    }

    let userId = input.userId ?? null;
    if (!userId) {
      const user = await db.user.findUnique({
        where: { email: authorEmail },
        select: { id: true },
      });
      userId = user?.id ?? null;
    }

    await db.recipeReview.upsert({
      where: {
        recipeSlug_authorEmail: {
          recipeSlug: input.recipeSlug,
          authorEmail,
        },
      },
      create: {
        recipeSlug: input.recipeSlug,
        authorName,
        authorEmail,
        rating: input.rating,
        body,
        userId,
      },
      update: {
        authorName,
        rating: input.rating,
        body,
        userId,
      },
    });

    return getRecipeReviewData(input.recipeSlug);
  } catch (error) {
    console.error("Recipe review submit failed", error);
    if (error instanceof Error && !/prisma|datasource|invocation/i.test(error.message)) {
      throw error;
    }
    throw new Error("Could not save your review. Please try again.");
  }
}

/**
 * Staff reply from Admin → Reviews (or an authorized staff API call).
 * Identity comes from the authenticated admin session — never client fields.
 * Parent is resolved by review id (optionally verified against recipeSlug).
 */
export async function submitAdminRecipeReviewReply(input: {
  reviewId: string;
  recipeSlug?: string;
  body: string;
  admin: {
    email: string;
    name: string;
    role: AccessLevel;
  };
}) {
  const body = sanitizePlainText(input.body, 5000);
  if (body.length < 3) {
    throw new Error("Reply must be at least 3 characters.");
  }

  const db = getDb();
  const review = await db.recipeReview.findUnique({
    where: { id: input.reviewId },
    select: { id: true, recipeSlug: true },
  });
  if (!review) return null;
  if (input.recipeSlug && review.recipeSlug !== input.recipeSlug) return null;

  const staff = await getStaffByEmail(input.admin.email);
  const authorName = sanitizePlainText(staff?.name || input.admin.name || "Staff", 80);
  const authorEmail = (staff?.email || input.admin.email).trim().toLowerCase().slice(0, 254);
  const role = staff?.role || input.admin.role;
  const authorTitle = role === "owner" ? site.name : `${site.name} team`;
  const authorPhotoUrl = (staff?.photoUrl || "").slice(0, 500);

  if (!authorName || !authorEmail) {
    throw new Error("Could not resolve staff identity for this reply.");
  }

  await db.recipeReviewReply.create({
    data: {
      reviewId: review.id,
      authorName,
      authorTitle,
      authorEmail,
      authorPhotoUrl,
      body,
      isStaff: true,
    },
  });

  return review.recipeSlug;
}

/**
 * Original review author continuing their conversation.
 * Identity comes from the authenticated member session — never client fields.
 */
export async function submitMemberRecipeReviewReply(input: {
  reviewId: string;
  recipeSlug?: string;
  body: string;
  member: {
    email: string;
    name: string;
    userId?: string | null;
    image?: string | null;
  };
}) {
  const body = sanitizePlainText(input.body, 5000);
  if (body.length < 3) {
    throw new Error("Reply must be at least 3 characters.");
  }

  const db = getDb();
  const review = await db.recipeReview.findUnique({
    where: { id: input.reviewId },
    select: { id: true, recipeSlug: true, userId: true, authorEmail: true },
  });
  if (!review) return null;
  if (input.recipeSlug && review.recipeSlug !== input.recipeSlug) return null;

  if (
    !isRecipeReviewAuthor(review, {
      email: input.member.email,
      userId: input.member.userId,
    })
  ) {
    throw new Error("You can only reply to your own review.");
  }

  const authorName = sanitizePlainText(input.member.name || "Member", 80);
  const authorEmail = input.member.email.trim().toLowerCase().slice(0, 254);
  const authorPhotoUrl = (input.member.image || "").slice(0, 500);

  if (!authorName || !authorEmail) {
    throw new Error("Could not resolve member identity for this reply.");
  }

  await db.recipeReviewReply.create({
    data: {
      reviewId: review.id,
      authorName,
      authorTitle: "",
      authorEmail,
      authorPhotoUrl,
      body,
      isStaff: false,
    },
  });

  return review.recipeSlug;
}

/** @deprecated Use staff/member authorized submit helpers instead. */
export async function submitRecipeReviewReply(input: {
  recipeSlug: string;
  reviewId: string;
  authorName: string;
  authorEmail: string;
  body: string;
}): Promise<RecipeReviewData> {
  void input;
  throw new Error("Unauthorized reply.");
}

export type AdminReviewListItem = {
  id: string;
  recipeSlug: string;
  recipeTitle: string;
  recipeId: string | null;
  /** Recipe.status when the recipe row exists; null if missing. */
  recipeStatus: string | null;
  userId: string | null;
  authorName: string;
  authorEmail: string;
  rating: number;
  body: string;
  createdAt: Date;
  replyCount: number;
  replies: {
    id: string;
    authorName: string;
    authorTitle: string;
    authorPhotoUrl: string;
    body: string;
    isStaff: boolean;
    createdAt: Date;
  }[];
};

export type AdminReviewListResult = {
  reviews: AdminReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const ADMIN_REVIEWS_PAGE_SIZE = 40;

const adminReviewReplySelect = {
  id: true,
  authorName: true,
  authorTitle: true,
  authorPhotoUrl: true,
  body: true,
  isStaff: true,
  createdAt: true,
} as const;

const adminReviewRowSelect = {
  id: true,
  recipeSlug: true,
  userId: true,
  authorName: true,
  authorEmail: true,
  rating: true,
  body: true,
  createdAt: true,
  _count: { select: { replies: true } },
  replies: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: adminReviewReplySelect,
  },
};

function humanizeRecipeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapAdminReviewRow(
  row: {
    id: string;
    recipeSlug: string;
    userId: string | null;
    authorName: string;
    authorEmail: string;
    rating: number;
    body: string;
    createdAt: Date;
    _count: { replies: number };
    replies: AdminReviewListItem["replies"];
  },
  recipe: { id: string; title: string; status: string } | undefined,
): AdminReviewListItem {
  return {
    id: row.id,
    recipeSlug: row.recipeSlug,
    recipeTitle: recipe?.title?.trim() || humanizeRecipeSlug(row.recipeSlug),
    recipeId: recipe?.id ?? null,
    recipeStatus: recipe?.status ?? null,
    userId: row.userId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt,
    replyCount: row._count.replies,
    replies: row.replies,
  };
}

export function formatReviewRating(rating: number) {
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return "—";
  return `${Math.round(rating)} / 5`;
}

/** Screen-reader phrase for the numeric rating (visible label stays "N / 5"). */
export function formatReviewRatingAccessible(rating: number) {
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return "Rating unavailable";
  return `Rated ${Math.round(rating)} out of 5`;
}

/** Count staff Mesa replies only — member follow-ups do not count as Mesa having responded. */
export function countStaffReviewReplies(replies: { isStaff: boolean }[]) {
  return replies.reduce((sum, reply) => sum + (reply.isStaff ? 1 : 0), 0);
}

/**
 * Presentation-only reply author lines for Admin → Reviews.
 * Does not mutate persisted authorName / authorTitle.
 */
export function formatAdminReplyAuthorDisplay(input: {
  authorName: string;
  authorTitle?: string | null;
  isStaff?: boolean;
}) {
  const name = input.authorName.trim();
  const title = (input.authorTitle || "").trim();
  const genericName = /^(owner|staff|admin|editor|audience)$/i.test(name);

  if (genericName && title) {
    return { primary: title, secondary: "" };
  }
  if (name && title && name.toLowerCase() !== title.toLowerCase()) {
    return { primary: name, secondary: title };
  }
  if (name) return { primary: name, secondary: "" };
  if (title) return { primary: title, secondary: "" };
  return { primary: input.isStaff ? "Staff" : "Member", secondary: "" };
}

/** Admin recipe link policy: public only when published; otherwise editor when id exists. */
export function adminReviewRecipeHref(input: {
  recipeId: string | null;
  recipeSlug: string;
  recipeStatus: string | null;
}): { href: string; external: boolean } | null {
  if (input.recipeStatus === "published" && input.recipeSlug) {
    return { href: `/recipes/${encodeURIComponent(input.recipeSlug)}`, external: true };
  }
  if (input.recipeId) {
    return { href: `/admin/recipes/${encodeURIComponent(input.recipeId)}`, external: false };
  }
  return null;
}

/** Initial top-level reviews shown on the public recipe page before "Show more". */
export const PUBLIC_RECIPE_VISIBLE_COMMENTS = 12;

/**
 * Public recipe URL that scrolls to a specific review.
 * Uses the stored recipe slug, never a title-derived slug.
 *
 * Links whenever the recipe is published OR status is unknown (join miss) —
 * only known drafts/unpublished stay unlinkable so titles never look clickable
 * while doing nothing. Query `review=` is the durable target; `#review-{id}`
 * is the DOM anchor.
 */
export function adminReviewPublicAnchorHref(input: {
  recipeSlug: string;
  recipeStatus: string | null;
  reviewId: string;
}): string | null {
  const slug = input.recipeSlug.trim();
  const reviewId = input.reviewId.trim();
  if (!slug || !reviewId) return null;
  const status = (input.recipeStatus || "").trim().toLowerCase();
  // Known non-public statuses: do not deep-link to the public site.
  if (status === "draft" || status === "archived" || status === "unpublished") {
    return null;
  }
  const encodedId = encodeURIComponent(reviewId);
  return `/recipes/${encodeURIComponent(slug)}?review=${encodedId}#review-${encodedId}`;
}

/** Resolve a targeted review id from `?review=` (preferred) or `#review-…` hash. */
export function resolvePublicTargetReviewId(input: {
  reviewQuery?: string | null;
  hash?: string | null;
}): string | null {
  const fromQuery = (input.reviewQuery || "").trim();
  if (fromQuery) return fromQuery;
  const hash = (input.hash || "").trim();
  const match = /^#?review-(.+)$/i.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Visible top-level reviews for the public list.
 * When a target id would be truncated, include it once (no duplicate) so the
 * deep-link anchor exists without forcing every historical review into the DOM.
 * Ordinary loads (no target) keep the first-page slice unchanged.
 */
export function visibleRecipeReviewsForTarget<T extends { id: string }>(
  reviews: T[],
  options: {
    showAll: boolean;
    targetReviewId?: string | null;
    visibleCount?: number;
  },
): T[] {
  const visibleCount = options.visibleCount ?? PUBLIC_RECIPE_VISIBLE_COMMENTS;
  if (options.showAll || reviews.length <= visibleCount) return reviews;

  const head = reviews.slice(0, visibleCount);
  const targetId = (options.targetReviewId || "").trim();
  if (!targetId) return head;
  if (head.some((review) => review.id === targetId)) return head;

  const target = reviews.find((review) => review.id === targetId);
  if (!target) return head;
  return [...head, target];
}

/** Member when linked to a User row; otherwise Visitor (guest review). */
export function formatAdminReviewerType(userId: string | null | undefined) {
  return userId ? "Member" : "Visitor";
}

export async function listReviewsForAdmin(options?: {
  page?: number;
  pageSize?: number;
}): Promise<AdminReviewListResult> {
  const pageSize = Math.min(Math.max(options?.pageSize ?? ADMIN_REVIEWS_PAGE_SIZE, 1), 100);
  const requestedPage = Math.max(options?.page ?? 1, 1);

  try {
    const db = getDb();
    const total = await db.recipeReview.count();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;

    const rows = await db.recipeReview.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      select: adminReviewRowSelect,
    });

    const slugs = [...new Set(rows.map((row) => row.recipeSlug))];
    const recipes = slugs.length
      ? await db.recipe.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true, title: true, status: true },
        })
      : [];
    const recipeBySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));

    return {
      total,
      page,
      pageSize,
      totalPages,
      reviews: rows.map((row) => mapAdminReviewRow(row, recipeBySlug.get(row.recipeSlug))),
    };
  } catch (error) {
    console.error("Could not list reviews for admin", error);
    return { reviews: [], total: 0, page: 1, pageSize, totalPages: 1 };
  }
}

/** Single review for Admin → Reviews detail. Returns null when missing. */
export async function getReviewForAdmin(id: string): Promise<AdminReviewListItem | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  try {
    const db = getDb();
    const row = await db.recipeReview.findUnique({
      where: { id: trimmed },
      select: adminReviewRowSelect,
    });
    if (!row) return null;

    const recipe = await db.recipe.findFirst({
      where: { slug: row.recipeSlug },
      select: { id: true, slug: true, title: true, status: true },
    });

    return mapAdminReviewRow(row, recipe ?? undefined);
  } catch (error) {
    console.error("Could not load review for admin", error);
    return null;
  }
}

export async function deleteReviewById(id: string) {
  const db = getDb();
  const review = await db.recipeReview.findUnique({ where: { id }, select: { recipeSlug: true } });
  if (!review) return null;
  await db.recipeReview.delete({ where: { id } });
  return review.recipeSlug;
}

/** Deduplicate and drop empty review IDs for bulk admin deletion. */
export function normalizeReviewIds(ids: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Hard-delete reviews by id (cascade replies via schema).
 * Returns deleted count and distinct recipe slugs for public revalidation.
 */
export async function deleteReviewsByIds(ids: string[]) {
  const unique = normalizeReviewIds(ids);
  if (!unique.length) return { deletedCount: 0, recipeSlugs: [] as string[] };

  const db = getDb();
  const rows = await db.recipeReview.findMany({
    where: { id: { in: unique } },
    select: { id: true, recipeSlug: true },
  });
  if (!rows.length) return { deletedCount: 0, recipeSlugs: [] as string[] };

  const existingIds = rows.map((row) => row.id);
  await db.recipeReview.deleteMany({ where: { id: { in: existingIds } } });
  const recipeSlugs = [...new Set(rows.map((row) => row.recipeSlug).filter(Boolean))];
  return { deletedCount: rows.length, recipeSlugs };
}

export async function deleteReviewReplyById(id: string) {
  const db = getDb();
  const reply = await db.recipeReviewReply.findUnique({
    where: { id },
    select: {
      reviewId: true,
      review: { select: { recipeSlug: true } },
    },
  });
  if (!reply) return null;
  await db.recipeReviewReply.delete({ where: { id } });
  return { recipeSlug: reply.review.recipeSlug, reviewId: reply.reviewId };
}
