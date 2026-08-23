import { notFound, redirect } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { isAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { deleteRecipeAction } from "../../actions";

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
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
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-4xl">Edit {recipe.title}</h1>
        <form action={deleteRecipeAction}>
          <input type="hidden" name="id" value={recipe.id} />
          <button className="text-sm text-muted hover:text-terracotta">Delete recipe</button>
        </form>
      </div>
      {saved ? <p className="mb-4 text-sm text-olive">Saved.</p> : null}
      <RecipeEditor
        recipeId={recipe.id}
        typeId={recipe.typeId}
        fields={recipe.type.fields.map((field) => ({
          ...field,
          options: JSON.parse(field.options || "[]") as string[],
        }))}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
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
    </div>
  );
}
