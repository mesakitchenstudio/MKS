"use client";

import type { ReactNode } from "react";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import { FloatingRecipeVideo } from "./FloatingRecipeVideo";
import { RecipeVideoProvider } from "./RecipeVideoContext";

export function RecipeVideoExperience({
  youtube,
  recipeSlug,
  recipeName,
  children,
}: {
  youtube: ResolvedRecipeYoutube;
  recipeSlug: string;
  recipeName: string;
  children: ReactNode;
}) {
  return (
    <RecipeVideoProvider youtube={youtube} recipeSlug={recipeSlug} recipeName={recipeName}>
      {children}
      <FloatingRecipeVideo />
    </RecipeVideoProvider>
  );
}
