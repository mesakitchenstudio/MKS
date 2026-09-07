import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseRecipeAiMeta } from "@/lib/ai-recipe/types";
import { ensureRecipeTypeCorrections } from "@/lib/ensure-recipe-type-corrections";
import { parseValues } from "@/lib/recipe-map";
import { parseRelatedRecipeIds } from "@/lib/recipe-related-overrides";
import { ensureRecipeOverviewFields } from "@/lib/recipe-overview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getDb().recipe.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!recipe) return { title: "Recipe" };
  return { title: recipe.title };
}

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    restored?: string;
    aiNotice?: string;
    error?: string;
    detail?: string;
    scheduled?: string;
    "schedule-cleared"?: string;
  }>;
}) {
  await requireAccess("content");
  await ensureRecipeOverviewFields();
  await ensureRecipeTypeCorrections();
  const { id } = await params;
  const query = await searchParams;
  const { saved, restored, aiNotice, error, detail, scheduled } = query;
  const scheduleCleared = query["schedule-cleared"];
  const db = getDb();
  const [recipe, categories, recipeTypes, relatedCandidates] = await Promise.all([
    db.recipe.findUnique({
      where: { id },
      include: {
        type: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
        categories: true,
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.recipe.findMany({
      where: { id: { not: id } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, slug: true, status: true },
    }),
  ]);
  if (!recipe) notFound();

  return (
    <RecipeEditor
      recipeId={recipe.id}
      typeId={recipe.typeId}
      typeName={recipe.type.name}
      recipeTypes={recipeTypes}
      relatedCandidates={relatedCandidates}
      saved={Boolean(saved)}
      restored={Boolean(restored)}
      scheduledNotice={
        scheduled === "1" ? "scheduled" : scheduleCleared === "1" ? "cleared" : undefined
      }
      aiNotice={aiNotice ? String(aiNotice) : undefined}
      serverError={
        error === "publish-readiness"
          ? detail
            ? decodeURIComponent(String(detail))
            : "Publishing readiness checks failed."
          : error === "schedule" && detail
            ? decodeURIComponent(String(detail))
            : error === "chapters" && detail
            ? decodeURIComponent(String(detail))
            : error === "public-update"
              ? detail
                ? decodeURIComponent(String(detail))
                : "Public update note is incomplete."
              : undefined
      }
      fields={recipe.type.fields.map((field) => ({
        ...field,
        options: JSON.parse(field.options || "[]") as string[],
      }))}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        group: category.group,
      }))}
      initial={{
        title: recipe.title,
        slug: recipe.slug,
        excerpt: recipe.excerpt,
        status: recipe.status,
        featured: recipe.featured,
        seasonal: recipe.seasonal,
        categoryIds: recipe.categories.map((item) => item.categoryId),
        relatedRecipeIds: parseRelatedRecipeIds(recipe.relatedRecipeIds),
        values: parseValues(recipe.values),
        aiMeta: parseRecipeAiMeta(recipe.aiMeta),
        publicUpdateNote: recipe.publicUpdateNote,
        publicUpdatedAt: recipe.publicUpdatedAt,
        scheduledPublishAt: recipe.scheduledPublishAt,
      }}
    />
  );
}
