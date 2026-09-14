import type { AdminDocTopic } from "../types";

export const ingredientsDocTopic: AdminDocTopic = {
  id: "ingredients",
  title: "Ingredients",
  summary:
    "Manage canonical ingredient identities and resolve unresolved authored ingredient phrases used for future discovery.",
  category: "library",
  routes: ["/admin/ingredients"],
  relatedTopicIds: ["recipes", "recipe-editor", "categories", "series"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Canonical Ingredients give Mesa a stable machine identity for ingredient discovery. Example: Egg.",
        "Aliases represent valid authored variations such as eggs, large eggs, or large egg → Egg.",
        "Recipe ingredient wording is never rewritten here. A recipe may still display “2 large free-range eggs” even when the canonical identity is Egg.",
        "When public ingredient filtering is enabled (INGREDIENT_DISCOVERY_ENABLED=true after Production seed, backfill, and vocabulary review), canonical Ingredients and aliases power the Ingredients filter on /recipes. Authored Recipe wording is still unchanged. Unresolved terms do not participate in canonical Ingredient filtering until resolved.",
        "Cook With What You Have (/cook-with-what-you-have) also uses canonical Ingredient identities when both INGREDIENT_DISCOVERY_ENABLED and COOK_WITH_WHAT_YOU_HAVE_ENABLED are true. Aliases let authored phrases such as “large eggs” count as Egg. Unresolved ingredient rows cannot contribute to a confident complete-match claim. Recipe wording remains unchanged.",
        "Shopping List (/shopping-list, SHOPPING_LIST_ENABLED) uses authored Recipe ingredient wording as the grocery snapshot. Canonical Ingredient identity can help conceptual grouping, but aggregation is deliberately conservative: discovery aliases do not automatically make grocery lines merge-equivalent (for example russet potatoes vs baby potatoes).",
        "Public ingredient filtering is separate from general recipe search (q=). Visitors use the Ingredients filter for culinary identity and q= for broad text search.",
      ],
    },
    {
      id: "public-ingredient-pages",
      title: "Public Ingredient pages",
      paragraphs: [
        "Canonical Ingredients with Published Recipe coverage can have public landing pages at /ingredient/{slug} when INGREDIENT_SEO_ENABLED=true (default off). There is no /ingredients directory.",
        "Indexability requires at least 3 distinct Published Recipes. Pages with 1–2 Published Recipes are reachable but noindex when the gate is on. Ingredients with zero Published Recipes are not public.",
        "On normal public Recipe detail pages, authored ingredient item text links to the canonical Ingredient page only when that Ingredient is indexable (≥3 Published Recipes) and Ingredient SEO is enabled. Amount and notes stay plain text. Authored wording is never rewritten to the canonical name.",
        "Aliases never create separate public Ingredient URLs. Only Ingredient.slug is the public identity (for example /ingredient/egg).",
        "Cooking Mode, Recipe print, Shopping List, Cook With What You Have, and /recipes ingredient filter chips do not add Ingredient SEO links.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Review coverage and unresolved frequency",
        "Resolve a high-frequency unresolved phrase to an existing Ingredient",
        "Create a new deliberate canonical Ingredient and map unresolved text to it",
        "Add or remove aliases on a canonical Ingredient",
        "Review Published Recipe counts and SEO readiness status before enabling Ingredient SEO",
      ],
    },
    {
      id: "how-it-works",
      title: "How it works",
      paragraphs: [
        "Editors explicitly map unresolved text to an existing Ingredient or a new canonical Ingredient. Mesa does not use fuzzy matching.",
        "When an alias or canonical identity changes, affected Recipes are reindexed from authoritative Recipe.values.ingredients. Derived index rows are rebuilt — they are never edited by hand.",
        "Higher coverage improves future ingredient-aware features. Review high-frequency unresolved terms first. Local development coverage is not Production coverage.",
        "Public Ingredient filtering on /recipes stays off until INGREDIENT_DISCOVERY_ENABLED=true after Production migration, seed, backfill, and vocabulary review. General q= search is unchanged.",
        "Cook With What You Have stays off until COOK_WITH_WHAT_YOU_HAVE_ENABLED=true as well (after the same Production readiness review). It is a separate pantry-matching utility, not another /recipes filter mode.",
        "Public Ingredient SEO pages stay off until INGREDIENT_SEO_ENABLED=true after density review (npm run ingredient:seo-readiness). Enable Ingredient SEO last among public ingredient gates.",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Do not paste long authored serving phrases as canonical Ingredient names",
        "Aliases and canonical names share one lookup namespace — collisions are rejected",
        "Do not silently remap an alias that already belongs to another Ingredient",
        "Draft, Scheduled, and Published recipes all count in Admin usage because all are indexed",
        "Published Recipe count for SEO uses distinct Published Recipes only",
        "Seed and full backfill remain operator CLI tools — they are not Admin buttons",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Prefer false negatives over unsafe collapses when choosing mappings",
        "Keep culinary-function splits separate when needed (Egg yolk ≠ Egg)",
        "Resolve the most frequent unresolved keys first",
        "Avoid Collections whose only purpose is duplicating a broad single-Ingredient landing",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with content access manage Ingredients. Audience Admin users cannot.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipes — authored ingredient text lives in the Recipe Editor",
        "Recipe Editor — writes Recipe.values.ingredients (authoritative)",
        "Categories — broad public taxonomy, separate from ingredient identity",
        "Collections — curated editorial hubs, separate from ingredient identity",
      ],
    },
  ],
};
