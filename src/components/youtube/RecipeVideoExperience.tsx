"use client";

import type { ReactNode } from "react";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import { FloatingRecipeVideo } from "./FloatingRecipeVideo";
import { RecipeVideoProvider } from "./RecipeVideoContext";

export function RecipeVideoExperience({
  youtube,
  recipeSlug,
  recipeName,
  watchNext = null,
  children,
}: {
  youtube: ResolvedRecipeYoutube;
  recipeSlug: string;
  recipeName: string;
  watchNext?: WatchNextRecommendation | null;
  children: ReactNode;
}) {
  return (
    <RecipeVideoProvider
      youtube={youtube}
      recipeSlug={recipeSlug}
      recipeName={recipeName}
      watchNext={watchNext}
    >
      {children}
      <FloatingRecipeVideo />
    </RecipeVideoProvider>
  );
}
