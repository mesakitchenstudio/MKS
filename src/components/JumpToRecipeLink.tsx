"use client";

import { trackEvent } from "@/lib/analytics";

export function JumpToRecipeLink({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  return (
    <a
      href="#recipe-card"
      onClick={() =>
        trackEvent("recipe_jump_to_recipe", {
          recipe_slug: slug,
          recipe_title: title,
        })
      }
      className="no-print rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark"
    >
      Jump to recipe
    </a>
  );
}
