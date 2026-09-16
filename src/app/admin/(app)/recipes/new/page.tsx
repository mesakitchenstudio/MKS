import { redirect } from "next/navigation";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { ensureRecipeOverviewFields } from "@/lib/recipe-overview";
import { isRecipeStepTimestampsEnabled } from "@/lib/flags";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string; detail?: string }>;
}) {
  await requireAccess("content");
  await ensureRecipeOverviewFields();
  const { type: typeId, error, detail } = await searchParams;
  if (!typeId) redirect("/admin");

  const db = getDb();
  const [recipeType, categories, recipeTypes, relatedCandidates] = await Promise.all([
    db.recipeType.findUnique({
      where: { id: typeId },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.recipe.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, slug: true, status: true },
    }),
  ]);
  if (!recipeType) redirect("/admin");

  return (
    <RecipeEditor
      typeId={recipeType.id}
      typeName={recipeType.name}
      recipeTypes={recipeTypes}
      relatedCandidates={relatedCandidates}
      stepTimestampsEnabled={isRecipeStepTimestampsEnabled()}
      serverError={
        error === "public-update"
          ? detail
            ? decodeURIComponent(String(detail))
            : "Public update note is incomplete."
          : error === "publish-readiness"
            ? detail
              ? decodeURIComponent(String(detail))
              : "Publishing readiness checks failed."
            : error === "chapters" && detail
              ? decodeURIComponent(String(detail))
              : error === "step-timestamps" && detail
                ? decodeURIComponent(String(detail))
                : undefined
      }
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
        publicUpdateNote: null,
        publicUpdatedAt: null,
      }}
    />
  );
}
