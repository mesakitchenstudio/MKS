import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseRecipeAiMeta } from "@/lib/ai-recipe/types";
import { parseValues } from "@/lib/recipe-map";
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
  searchParams: Promise<{ saved?: string; aiNotice?: string }>;
}) {
  await requireAccess("content");
  await ensureRecipeOverviewFields();
  const { id } = await params;
  const { saved, aiNotice } = await searchParams;
  const db = getDb();
  const [recipe, categories] = await Promise.all([
    db.recipe.findUnique({
      where: { id },
      include: {
        type: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
        categories: true,
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!recipe) notFound();

  return (
    <RecipeEditor
      recipeId={recipe.id}
      typeId={recipe.typeId}
      typeName={recipe.type.name}
      saved={Boolean(saved)}
      aiNotice={aiNotice ? String(aiNotice) : undefined}
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
        values: parseValues(recipe.values),
        aiMeta: parseRecipeAiMeta(recipe.aiMeta),
      }}
    />
  );
}
