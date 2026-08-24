import { site } from "@/data/site";
import type { Recipe } from "@/data/types";
import { bakeMinutes, isoDuration, totalMinutes } from "@/lib/recipe-utils";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    description: site.description,
    email: site.email,
    sameAs: Object.values(site.social),
  };
}

export function recipeJsonLd(recipe: Recipe) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.excerpt,
    image: [recipe.image],
    author: {
      "@type": "Organization",
      name: site.name,
    },
    datePublished: recipe.publishedAt,
    dateModified: recipe.updatedAt,
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(bakeMinutes(recipe)),
    totalTime: isoDuration(totalMinutes(recipe)),
    recipeYield: `${recipe.servings} ${recipe.servingsUnit}`,
    recipeCategory: recipe.course,
    recipeCuisine: recipe.cuisine,
    keywords: recipe.tags.join(", "),
    recipeIngredient: recipe.ingredients.flatMap((group) =>
      group.items.map((item) =>
        [item.amount, item.item, item.notes ? `(${item.notes})` : ""]
          .filter(Boolean)
          .join(" "),
      ),
    ),
    recipeInstructions: recipe.instructions.flatMap((group) =>
      group.steps.map((step, index) => ({
        "@type": "HowToStep",
        name: group.name ? `${group.name} ${index + 1}` : `Step ${index + 1}`,
        text: step,
      })),
    ),
    nutrition: {
      "@type": "NutritionInformation",
      calories: `${recipe.nutrition.calories} calories`,
      carbohydrateContent: `${recipe.nutrition.carbs} grams`,
      proteinContent: `${recipe.nutrition.protein} grams`,
      fatContent: `${recipe.nutrition.fat} grams`,
    },
  };
}

