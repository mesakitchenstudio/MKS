import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { ensureRecipeOverviewFields } from "@/lib/recipe-overview";

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAccess("content");
  await ensureRecipeOverviewFields();
  const { id } = await params;
  const { saved } = await searchParams;
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
      }}
    />
  );
}
