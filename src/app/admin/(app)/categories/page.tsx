import type { Metadata } from "next";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { requireAccess } from "@/lib/auth";
import { type AdminCategory } from "@/lib/category-admin";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Categories",
};

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    categoryId?: string;
    deleted?: string;
    error?: string;
    add?: string;
    name?: string;
    slug?: string;
    description?: string;
    group?: string;
  }>;
}) {
  await requireAccess("content");
  const query = await searchParams;
  const rows = await getDb().category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { recipes: true } } },
  });

  const categories: AdminCategory[] = rows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    group: category.group,
    recipeCount: category._count.recipes,
  }));

  const savedCategoryId =
    query.saved === "category" && query.categoryId ? query.categoryId : null;
  const addError =
    query.error === "missing-name" ||
    query.error === "duplicate-slug" ||
    query.error === "invalid-slug" ||
    query.error === "invalid-group"
      ? query.error
      : undefined;

  return (
    <div className="min-w-0">
      <CategoriesManager
        categories={categories}
        savedCategoryId={savedCategoryId}
        initialAddOpen={query.add === "1" || Boolean(addError)}
        addError={addError}
        addInitial={{
          name: query.name,
          slug: query.slug,
          description: query.description,
          group: query.group,
        }}
        deleted={query.deleted === "category"}
      />
    </div>
  );
}
