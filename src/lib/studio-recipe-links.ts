import "server-only";

import { lessons, getLessonBySlug } from "@/data/lessons";
import type { Lesson } from "@/data/types";
import { getDb } from "@/lib/db";
import type { Recipe } from "@/data/types";
import { STUDIO_PUBLIC_LINK_LIMIT } from "@/lib/studio-recipe-link-utils";
import type { StudioLessonSummary, StudioRecipeLinkRow } from "@/lib/studio-types";
import { canViewStudioLesson, isStudioPublicLaunchEnabled } from "@/lib/studio-public";

export type { StudioLessonSummary, StudioRecipeLinkRow };

const MAX_PUBLIC_LINKS = STUDIO_PUBLIC_LINK_LIMIT;

function uniqueSlugs(slugs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    const key = slug.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export async function listStudioLessonRecipeLinks(lessonSlug: string) {
  const db = getDb();
  return db.studioLessonRecipeLink.findMany({
    where: { lessonSlug },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { recipeId: true, recipe: { select: { slug: true, title: true } } },
  });
}

export async function listRecipeIdsForLessonSlug(lessonSlug: string): Promise<string[]> {
  const rows = await listStudioLessonRecipeLinks(lessonSlug);
  return rows.map((row) => row.recipeId);
}

export async function listLessonSlugsForRecipeId(recipeId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.studioLessonRecipeLink.findMany({
    where: { recipeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { lessonSlug: true },
  });
  return rows.map((row) => row.lessonSlug);
}

/** Database links when present; otherwise legacy static slugs from lesson content. */
export async function resolveLessonRelatedRecipeSlugs(lessonSlug: string): Promise<string[]> {
  const db = getDb();
  const dbRows = await db.studioLessonRecipeLink.findMany({
    where: { lessonSlug },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { recipe: { select: { slug: true } } },
  });
  if (dbRows.length > 0) {
    return uniqueSlugs(dbRows.map((row) => row.recipe.slug));
  }
  const lesson = getLessonBySlug(lessonSlug);
  return uniqueSlugs(lesson?.relatedRecipeSlugs || []);
}

export async function getRelatedRecipesForLesson(
  lessonSlug: string,
  publishedRecipes: Recipe[],
): Promise<StudioRecipeLinkRow[]> {
  const slugs = (await resolveLessonRelatedRecipeSlugs(lessonSlug)).slice(0, MAX_PUBLIC_LINKS);
  const bySlug = new Map(publishedRecipes.map((recipe) => [recipe.slug, recipe]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((recipe): recipe is Recipe => Boolean(recipe))
    .map((recipe) => ({
      slug: recipe.slug,
      title: recipe.title,
      image: recipe.image,
      imageAlt: recipe.imageAlt,
    }));
}

export async function getRelatedLessonsForRecipe(recipeId: string): Promise<StudioLessonSummary[]> {
  if (!isStudioPublicLaunchEnabled()) return [];
  const slugs = uniqueSlugs(await listLessonSlugsForRecipeId(recipeId)).slice(0, MAX_PUBLIC_LINKS);
  return slugs
    .map((slug) => getLessonBySlug(slug))
    .filter((lesson): lesson is Lesson => Boolean(lesson))
    .filter((lesson) => canViewStudioLesson(lesson, false))
    .map(({ slug, title, excerpt, type }) => ({ slug, title, excerpt, type }));
}

export async function getRelatedLessonsForRecipeSlug(
  recipeSlug: string,
): Promise<StudioLessonSummary[]> {
  const db = getDb();
  const recipe = await db.recipe.findUnique({
    where: { slug: recipeSlug },
    select: { id: true },
  });
  if (!recipe) return [];
  return getRelatedLessonsForRecipe(recipe.id);
}

export async function replaceStudioLessonRecipeLinks(input: {
  lessonSlug: string;
  recipeIds: string[];
}) {
  const db = getDb();
  const lessonSlug = input.lessonSlug.trim();
  if (!getLessonBySlug(lessonSlug)) {
    throw new Error("Unknown studio lesson.");
  }
  const recipeIds = uniqueSlugs(input.recipeIds.filter(Boolean));
  await db.$transaction([
    db.studioLessonRecipeLink.deleteMany({ where: { lessonSlug } }),
    ...recipeIds.map((recipeId, index) =>
      db.studioLessonRecipeLink.create({
        data: { lessonSlug, recipeId, sortOrder: index },
      }),
    ),
  ]);
}

export async function seedStudioLessonRecipeLinksFromLessons() {
  const db = getDb();
  for (const lesson of lessons) {
    const slugs = lesson.relatedRecipeSlugs || [];
    if (!slugs.length) continue;
    const existing = await db.studioLessonRecipeLink.count({ where: { lessonSlug: lesson.slug } });
    if (existing > 0) continue;
    const recipes = await db.recipe.findMany({
      where: { slug: { in: slugs }, status: "published" },
      select: { id: true, slug: true },
    });
    const bySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe.id]));
    const recipeIds = slugs.map((slug) => bySlug.get(slug)).filter((id): id is string => Boolean(id));
    if (!recipeIds.length) continue;
    await db.$transaction(
      recipeIds.map((recipeId, index) =>
        db.studioLessonRecipeLink.create({
          data: { lessonSlug: lesson.slug, recipeId, sortOrder: index },
        }),
      ),
    );
  }
}

export { STUDIO_PUBLIC_LINK_LIMIT } from "@/lib/studio-recipe-link-utils";
export { pickLessonRelatedRecipeSlugs } from "@/lib/studio-recipe-link-utils";
