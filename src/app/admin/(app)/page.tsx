import type { Metadata } from "next";
import { RecipesIndex } from "@/components/admin/RecipesIndex";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminHomePage() {
  await requireAccess("content");

  const db = getDb();
  const [recipes, types] = await Promise.all([
    db.recipe.findMany({
      include: { type: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.recipeType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <RecipesIndex
      recipes={recipes.map((recipe) => ({
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        status: recipe.status,
        updatedAt: recipe.updatedAt.toISOString(),
        type: { id: recipe.type.id, name: recipe.type.name },
      }))}
      types={types.map((type) => ({ id: type.id, name: type.name }))}
    />
  );
}
