import type { Metadata } from "next";
import { RecipeDetailView } from "@/components/recipe/RecipeDetailView";
import { RecipePreviewBanner } from "@/components/recipe/RecipePreviewBanner";
import { RecipePreviewEngagementGate } from "@/components/recipe/RecipePreviewEngagementGate";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadAdminRecipePreviewById } from "@/lib/recipe-admin-preview-server";
import { loadRecipeDetailPresentation } from "@/lib/recipe-detail-presentation";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = await getDb().recipe.findUnique({
    where: { id },
    select: { title: true, slug: true, status: true },
  });
  if (!row) {
    return {
      title: "Recipe Preview",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${row.title} — Preview`,
    robots: { index: false, follow: false },
    // Never advertise the preview URL as canonical. Point at the live public
    // URL only when the recipe is actually published.
    ...(row.status === "published"
      ? { alternates: { canonical: `/recipes/${row.slug}` } }
      : {}),
  };
}

export default async function AdminRecipePreviewPage({ params }: Props) {
  await requireAccess("content");
  const { id } = await params;
  const preview = await loadAdminRecipePreviewById(id);
  const detail = await loadRecipeDetailPresentation(preview.recipe);

  const editorHref = `/admin/recipes/${id}`;
  const liveHref =
    preview.status === "published" ? `/recipes/${preview.recipe.slug}` : undefined;

  return (
    <RecipePreviewEngagementGate>
      <RecipePreviewBanner
        status={preview.status}
        editorHref={editorHref}
        liveHref={liveHref}
      />
      <RecipeDetailView mode="preview" {...detail} />
    </RecipePreviewEngagementGate>
  );
}
