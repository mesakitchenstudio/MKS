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
export async function submitRecipeReviewReply(_input: {
  recipeSlug: string;
  reviewId: string;
  authorName: string;
  authorEmail: string;
  body: string;
}): Promise<RecipeReviewData> {
  throw new Error("Unauthorized reply.");
}

export type AdminReviewListItem = {
  id: string;
  recipeSlug: string;
  recipeTitle: string;
  recipeId: string | null;
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

function humanizeRecipeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReviewRating(rating: number) {
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return "—";
  return `${Math.round(rating)} / 5`;
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
      select: {
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

    const slugs = [...new Set(rows.map((row) => row.recipeSlug))];
    const recipes = slugs.length
      ? await db.recipe.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true, title: true },
        })
      : [];
    const recipeBySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));

    return {
      total,
      page,
      pageSize,
      totalPages,
      reviews: rows.map((row) => {
        const recipe = recipeBySlug.get(row.recipeSlug);
        return {
          id: row.id,
          recipeSlug: row.recipeSlug,
          recipeTitle: recipe?.title?.trim() || humanizeRecipeSlug(row.recipeSlug),
          recipeId: recipe?.id ?? null,
          userId: row.userId,
          authorName: row.authorName,
          authorEmail: row.authorEmail,
          rating: row.rating,
          body: row.body,
          createdAt: row.createdAt,
          replyCount: row._count.replies,
          replies: row.replies,
        };
      }),
    };
  } catch (error) {
    console.error("Could not list reviews for admin", error);
    return { reviews: [], total: 0, page: 1, pageSize, totalPages: 1 };
  }
}

export async function deleteReviewById(id: string) {
  const db = getDb();
  const review = await db.recipeReview.findUnique({ where: { id }, select: { recipeSlug: true } });
  if (!review) return null;
  await db.recipeReview.delete({ where: { id } });
  return review.recipeSlug;
}

export async function deleteReviewReplyById(id: string) {
  const db = getDb();
  const reply = await db.recipeReviewReply.findUnique({
    where: { id },
    select: { review: { select: { recipeSlug: true } } },
  });
  if (!reply) return null;
  await db.recipeReviewReply.delete({ where: { id } });
  return reply.review.recipeSlug;
}
