import { notFound } from "next/navigation";
import { toPublicRecipe, type DbRecipeRecord } from "@/lib/recipe-map";
import { getDb } from "@/lib/db";
import {
  adminRecipePreviewStatus,
  type AdminRecipePreviewStatus,
} from "@/lib/recipe-admin-preview";
import { recipePublicationLabel } from "@/lib/recipe-schedule";
import type { PublicRecipe } from "@/lib/recipes";

/** Load any-status recipe by id for Admin preview (not the published catalogue). */
export async function loadAdminRecipePreviewById(recipeId: string): Promise<{
  recipe: PublicRecipe;
  status: AdminRecipePreviewStatus;
  statusLabel: string;
  scheduledPublishAt: Date | null;
}> {
  const id = recipeId.trim();
  if (!id) notFound();

  const row = await getDb().recipe.findUnique({
    where: { id },
    include: {
      type: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
      categories: { include: { category: true } },
    },
  });
  if (!row) notFound();

  const record: DbRecipeRecord = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    featured: row.featured,
    seasonal: row.seasonal,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    publicUpdateNote: row.publicUpdateNote,
    publicUpdatedAt: row.publicUpdatedAt,
    values: row.values,
    categories: row.categories.map((item) => ({ category: { slug: item.category.slug } })),
    type: row.type
      ? {
          name: row.type.name,
          fields: row.type.fields.map((field) => ({
            key: field.key,
            label: field.label,
            kind: field.kind,
            sortOrder: field.sortOrder,
          })),
        }
      : undefined,
  };

  const status = adminRecipePreviewStatus({
    status: row.status,
    scheduledPublishAt: row.scheduledPublishAt,
  });

  return {
    recipe: toPublicRecipe(record),
    status,
    statusLabel: recipePublicationLabel({
      status: row.status,
      scheduledPublishAt: row.scheduledPublishAt,
    }),
    scheduledPublishAt: row.scheduledPublishAt,
  };
}
