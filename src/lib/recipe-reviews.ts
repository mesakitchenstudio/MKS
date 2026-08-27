import { getStaffByEmail } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { site } from "@/data/site";
import { validateReviewInput } from "@/lib/user-content";

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
};

function emptyReviewData(): RecipeReviewData {
  return { reviews: [], stats: { average: 0, count: 0 } };
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

export async function getRecipeReviewData(recipeSlug: string): Promise<RecipeReviewData> {
  try {
    const db = getDb();
    const reviews = await db.recipeReview.findMany({
      where: { recipeSlug },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        authorName: true,
        rating: true,
        body: true,
        createdAt: true,
        replies: {
          orderBy: { createdAt: "asc" },
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
    return {
      reviews: reviews.map(toRow),
      stats: {
        average: Math.round((total / reviews.length) * 10) / 10,
        count: reviews.length,
      },
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

export async function submitRecipeReviewReply(input: {
  recipeSlug: string;
  reviewId: string;
  authorName: string;
  authorEmail: string;
  body: string;
}) {
  const db = getDb();
  const { authorName, authorEmail, body } = validateReviewInput({
    authorName: input.authorName,
    authorEmail: input.authorEmail,
    body: input.body,
    minBodyLength: 3,
  });

  try {
    const review = await db.recipeReview.findFirst({
      where: { id: input.reviewId, recipeSlug: input.recipeSlug },
      select: { id: true },
    });
    if (!review) throw new Error("Comment not found.");

    const staff = await getStaffByEmail(authorEmail);
    const isStaff = Boolean(staff);
    const authorTitle = isStaff
      ? staff?.role === "owner"
        ? site.name
        : `${site.name} team`
      : "";

    await db.recipeReviewReply.create({
      data: {
        reviewId: input.reviewId,
        authorName: isStaff ? staff?.name || authorName : authorName,
        authorTitle,
        authorEmail,
        authorPhotoUrl: isStaff ? staff?.photoUrl || "" : "",
        body,
        isStaff,
      },
    });

    return getRecipeReviewData(input.recipeSlug);
  } catch (error) {
    console.error("Recipe reply submit failed", error);
    if (error instanceof Error && !/prisma|datasource|invocation/i.test(error.message)) {
      throw error;
    }
    throw new Error("Could not save your reply. Please try again.");
  }
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
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorName: true,
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
