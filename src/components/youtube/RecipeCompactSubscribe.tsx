"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

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
    <p className={`no-print text-sm text-muted ${variant === "post_video" ? "mt-5" : "mt-8"}`}>
      {variant === "post_video" ? "Enjoyed the video?" : "Cook with Mesa every week?"}{" "}
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
