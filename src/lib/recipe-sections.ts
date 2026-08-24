import type { Recipe } from "@/data/types";
import type { ExtraField } from "@/lib/recipe-map";
import { youtubeVideoId } from "@/lib/youtube";

export type RecipeTocItem = {
  id: string;
  label: string;
};

function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function recipeTocItems(recipe: Recipe & { extras?: ExtraField[] }): RecipeTocItem[] {
  const items: RecipeTocItem[] = [];

  if (recipe.youtubeUrl && youtubeVideoId(recipe.youtubeUrl)) {
    items.push({ id: "studio-video", label: "Watch in the studio" });
  }
  if (recipe.whyItWorks.trim()) {
    items.push({ id: "why-this-works", label: "Why this works" });
  }
  if (recipe.keyIngredients.some((item) => item.name.trim() || item.note.trim())) {
    items.push({ id: "key-ingredients", label: "Key ingredients" });
  }
  if (recipe.tips.some(Boolean)) {
    items.push({ id: "studio-tips", label: "Studio tips" });
  }
  items.push({ id: "recipe-card", label: "Recipe" });
  if (recipe.faqs.some((item) => item.question.trim() || item.answer.trim())) {
    items.push({ id: "faqs", label: "Frequently asked" });
  }
  for (const extra of recipe.extras ?? []) {
    const id = `extra-${extra.key || slugifyHeading(extra.label)}`;
    items.push({ id, label: extra.label });
  }

  return items;
}
