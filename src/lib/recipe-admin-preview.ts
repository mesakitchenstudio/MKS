import {
  isRecipeScheduled,
  normalizeRecipePublicationStatus,
  recipePublicationLabel,
} from "@/lib/recipe-schedule";

export type AdminRecipePreviewStatus = "draft" | "scheduled" | "published";

/** Protected preview URL keyed by canonical Recipe.id. */
export function adminRecipePreviewPath(recipeId: string) {
  const id = recipeId.trim();
  if (!id) return "";
  return `/admin/recipes/${encodeURIComponent(id)}/preview`;
}

export function adminRecipePreviewStatus(input: {
  status: string;
  scheduledPublishAt?: Date | string | null;
}): AdminRecipePreviewStatus {
  if (normalizeRecipePublicationStatus(input.status) === "published") return "published";
  if (isRecipeScheduled(input)) return "scheduled";
  return "draft";
}

export function adminRecipePreviewBannerCopy(status: AdminRecipePreviewStatus): {
  eyebrow: string;
  detail: string;
} {
  switch (status) {
    case "published":
      return {
        eyebrow: "Preview",
        detail: "This recipe is currently published.",
      };
    case "scheduled":
      return {
        eyebrow: "Scheduled preview",
        detail: "This recipe is not live yet.",
      };
    default:
      return {
        eyebrow: "Draft preview",
        detail: "This recipe is not publicly visible.",
      };
  }
}

export { recipePublicationLabel };
