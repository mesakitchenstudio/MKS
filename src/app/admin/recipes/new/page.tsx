import { redirect } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAccess("content");
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
    <div>
      <h1 className="mb-6 font-serif text-4xl">New {recipeType.name.toLowerCase()}</h1>
      <RecipeEditor
        typeId={recipeType.id}
        fields={recipeType.fields.map((field) => ({
          ...field,
          options: JSON.parse(field.options || "[]") as string[],
        }))}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
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
    </div>
  );
}
