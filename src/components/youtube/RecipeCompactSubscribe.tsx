"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";
import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";

export function RecipeCompactSubscribe({
  recipeSlug,
  recipeName,
  videoId,
  variant = "end",
}: {
  recipeSlug?: string;
  recipeName?: string;
  videoId?: string;
  variant?: "post_video" | "end";
}) {
  const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;

  return (
    <p className={`no-print text-sm text-muted ${variant === "post_video" ? "mt-4" : "mt-6"}`}>
      {variant === "post_video" ? "Enjoyed the method?" : "Cook with Mesa every week?"}{" "}
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            video_id: videoId,
            source: variant === "post_video" ? "post_video_subscribe" : "end_of_recipe",
          })
        }
        className="font-semibold text-olive hover:text-terracotta hover:underline"
      >
        Subscribe to Mesa on YouTube →
      </a>
    </p>
  );
}

/** End-of-page subscribe when the visitor has not already seen the post-video CTA. */
export function RecipeEndSubscribe({
  recipeSlug,
  recipeName,
}: {
  recipeSlug: string;
  recipeName: string;
}) {
  const video = useRecipeVideoOptional();
  if (video?.videoInteracted) return null;

  return (
    <RecipeCompactSubscribe recipeSlug={recipeSlug} recipeName={recipeName} variant="end" />
  );
}
