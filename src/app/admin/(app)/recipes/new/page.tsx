import { redirect } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { ensureRecipeOverviewFields } from "@/lib/recipe-overview";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAccess("content");
  await ensureRecipeOverviewFields();
  const { type: typeId } = await searchParams;
  if (!typeId) redirect("/admin");

  const db = getDb();
  const [recipeType, categories] = await Promise.all([
    db.recipeType.findUnique({
      where: { id: typeId },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!recipeType) redirect("/admin");

  return (
    <RecipeEditor
      typeId={recipeType.id}
      typeName={recipeType.name}
      fields={recipeType.fields.map((field) => ({
        ...field,
        options: JSON.parse(field.options || "[]") as string[],
      }))}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        group: category.group,
      }))}
      initial={{
        title: "",
        slug: "",
        excerpt: "",
        status: "draft",
        featured: false,
        seasonal: false,
        categoryIds: [],
        values: parseValues("{}"),
      }}
    />
  );
}
