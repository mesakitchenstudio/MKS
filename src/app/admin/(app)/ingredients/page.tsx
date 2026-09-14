import type { Metadata } from "next";
import { IngredientsManager } from "@/components/admin/IngredientsManager";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  loadAdminIngredientCoverage,
  loadAdminIngredientListPage,
  loadAdminIngredientOptions,
  loadAdminUnresolvedIngredientPage,
} from "@/lib/ingredient-admin";
import { isIngredientSeoEnabled } from "@/lib/ingredient-seo";

export const metadata: Metadata = {
  title: "Ingredients",
};

export default async function AdminIngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    q?: string;
    saved?: string;
    message?: string;
    error?: string;
    detail?: string;
    ingredientId?: string;
    expand?: string;
    resolve?: string;
    add?: string;
    name?: string;
  }>;
}) {
  await requireAccess("content");
  const query = await searchParams;
  const tab = query.tab === "ingredients" ? "ingredients" : "unresolved";
  const page = Math.max(Number(query.page) || 1, 1);
  const q = query.q ?? "";
  const db = getDb();

  const [coverage, unresolved, ingredients, ingredientOptions] = await Promise.all([
    loadAdminIngredientCoverage(db),
    loadAdminUnresolvedIngredientPage(db, { page: tab === "unresolved" ? page : 1, q }),
    loadAdminIngredientListPage(db, { page: tab === "ingredients" ? page : 1, q }),
    loadAdminIngredientOptions(db, { take: 80 }),
  ]);

  return (
    <div className="min-w-0">
      <IngredientsManager
        coverage={coverage}
        unresolved={unresolved}
        ingredients={ingredients}
        ingredientOptions={ingredientOptions}
        tab={tab}
        message={query.message}
        errorDetail={query.detail}
        expandIngredientId={query.expand || query.ingredientId}
        resolveKey={query.resolve}
        initialAddOpen={query.add === "1"}
        addName={query.name}
        ingredientSeoEnabled={isIngredientSeoEnabled()}
      />
    </div>
  );
}
