import { getStaffByEmail } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { site } from "@/data/site";

export type RecipeReviewReplyRow = {
  id: string;
  authorName: string;
  authorTitle: string;
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
  body: string;
  isStaff: boolean;
  createdAt: Date;
}): RecipeReviewReplyRow {
  return {
    id: reply.id,
    authorName: reply.authorName,
    authorTitle: reply.authorTitle,
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
  const authorName = input.authorName.trim();
  const authorEmail = input.authorEmail.trim().toLowerCase();
  const body = input.body.trim();

  if (!authorName || !authorEmail || !body) {
    throw new Error("Name, email, and comment are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
    throw new Error("Enter a valid email address.");
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("Choose a rating from 1 to 5 stars.");
  }
  if (body.length < 10) {
    throw new Error("Comments must be at least 10 characters.");
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
  const authorName = input.authorName.trim();
  const authorEmail = input.authorEmail.trim().toLowerCase();
  const body = input.body.trim();

  if (!authorName || !authorEmail || !body) {
    throw new Error("Name, email, and reply are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
    throw new Error("Enter a valid email address.");
  }
  if (body.length < 3) {
    throw new Error("Replies must be at least 3 characters.");
  }

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
