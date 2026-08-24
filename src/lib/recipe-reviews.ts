import { getDb } from "@/lib/db";

export type RecipeReviewRow = {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
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

function toRow(review: {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: Date;
}): RecipeReviewRow {
  return {
    id: review.id,
    authorName: review.authorName,
    rating: review.rating,
    body: review.body,
    createdAt: review.createdAt.toISOString(),
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
  } catch {
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
