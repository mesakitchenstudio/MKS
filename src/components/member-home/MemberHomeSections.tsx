import type { Recipe } from "@/data/types";
import Link from "next/link";
import { RecipeImage } from "@/components/RecipeImage";
import { MemberHomeCreateCollectionButton } from "@/components/member-home/MemberHomeCreateCollectionButton";
import {
  MemberHomeButtonLink,
  MemberHomeRecipeShelf,
  MemberHomeTextLink,
  RecommendationRecipeCard,
} from "@/components/member-home/RecommendationRecipeCard";
import { authFocusRing } from "@/lib/auth-ui";
import type {
  MemberHomeCollectionPreviewItem,
  MemberHomeRecommendation,
} from "@/lib/member-home";

export function MemberHomeRecommendationsSection({
  items,
  recipesBySlug,
}: {
  items: MemberHomeRecommendation[];
  recipesBySlug: Map<string, Recipe>;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-recommended">
      <h2 id="member-home-recommended" className="font-serif text-3xl text-ink">
        Recommended for You
      </h2>
      <p className="mt-1.5 max-w-xl text-sm text-muted">
        Based on recipes you&apos;ve saved — Published recipes only.
      </p>
      <ul
        aria-labelledby="member-home-recommended"
        className="mt-6 grid list-none gap-8 sm:grid-cols-2 lg:grid-cols-4"
      >
        {items.map((item) => {
          const recipe = recipesBySlug.get(item.recipe.slug);
          if (!recipe) return null;
          return (
            <RecommendationRecipeCard
              key={item.recipe.slug}
              recipe={recipe}
              reasonLabel={item.reason.label}
            />
          );
        })}
      </ul>
    </section>
  );
}

export function MemberHomeDiscoverSection({
  recipes,
  showGetStartedHint = false,
}: {
  recipes: Recipe[];
  showGetStartedHint?: boolean;
}) {
  if (recipes.length === 0) return null;

  return (
    <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-discover">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="member-home-discover" className="font-serif text-3xl text-ink">
            Discover something new
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            {showGetStartedHint
              ? "Latest recipes from Mesa to get you started."
              : "Fresh picks from the Published catalogue."}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <MemberHomeTextLink href="/recipes">Browse all recipes</MemberHomeTextLink>
          <MemberHomeTextLink href="/cook-with-what-you-have">
            Cook With What You Have
          </MemberHomeTextLink>
        </div>
      </div>
      <MemberHomeRecipeShelf recipes={recipes} labelledBy="member-home-discover" />
    </section>
  );
}

export function MemberHomeGetStarted({ mealPlannerEnabled }: { mealPlannerEnabled: boolean }) {
  return (
    <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-get-started">
      <h2 id="member-home-get-started" className="font-serif text-3xl text-ink">
        Get started
      </h2>
      <p className="mt-1.5 max-w-xl text-sm text-muted">
        A few quick ways to make Mesa yours.
      </p>
      <ul className="mt-5 flex list-none flex-col gap-3 sm:flex-row sm:flex-wrap">
        <li>
          <MemberHomeButtonLink href="/recipes">Save a recipe</MemberHomeButtonLink>
        </li>
        {mealPlannerEnabled ? (
          <li>
            <MemberHomeButtonLink href="/profile/meal-planner">Start Meal Planning</MemberHomeButtonLink>
          </li>
        ) : null}
        <li>
          <MemberHomeButtonLink href="/series">Explore recipe series</MemberHomeButtonLink>
        </li>
      </ul>
    </section>
  );
}

export function MemberHomeCollectionsSection({
  collections,
  totalCollectionCount,
  hasVisibleSaves,
  status,
}: {
  collections: MemberHomeCollectionPreviewItem[];
  totalCollectionCount: number;
  hasVisibleSaves: boolean;
  status: "ok" | "empty" | "unavailable";
}) {
  if (status === "unavailable") {
    return (
      <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-collections">
        <h2 id="member-home-collections" className="font-serif text-3xl text-ink">
          Your Collections
        </h2>
        <p className="mt-1.5 text-sm text-muted" role="status">
          Collections could not be loaded right now.
        </p>
      </section>
    );
  }

  if (totalCollectionCount === 0) {
    if (!hasVisibleSaves) return null;
    return (
      <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-collections">
        <h2 id="member-home-collections" className="font-serif text-3xl text-ink">
          Your Collections
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-muted">
          Organize your saved recipes into private folders.
        </p>
        <div className="mt-4">
          <MemberHomeCreateCollectionButton />
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-collections">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="member-home-collections" className="font-serif text-3xl text-ink">
            Your Collections
          </h2>
          <p className="mt-1.5 text-sm text-muted">Private folders for recipes you&apos;ve saved.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MemberHomeCreateCollectionButton label="New collection" />
        </div>
      </div>
      <ul
        aria-labelledby="member-home-collections"
        className="mt-6 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {collections.map((collection) => (
          <li key={collection.id} className="min-w-0">
            <Link
              href={`/profile/collections/${collection.id}`}
              className={`flex h-full flex-col rounded-sm border border-line bg-paper p-4 transition-colors hover:bg-cream/60 ${authFocusRing}`}
            >
              <p className="font-serif text-2xl leading-snug text-ink">{collection.name}</p>
              <p className="mt-1 text-sm text-muted">
                {collection.visiblePublishedItemCount === 0
                  ? "0 available recipes"
                  : collection.visiblePublishedItemCount === 1
                    ? "1 available recipe"
                    : `${collection.visiblePublishedItemCount} available recipes`}
              </p>
              {collection.latestPublishedRecipe ? (
                <div className="mt-3 flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-sand">
                    <RecipeImage
                      src={collection.latestPublishedRecipe.image}
                      alt={collection.latestPublishedRecipe.imageAlt}
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                  <p className="min-w-0 line-clamp-2 text-sm font-semibold text-ink">
                    {collection.latestPublishedRecipe.title}
                  </p>
                </div>
              ) : null}
              <span className="mt-4 text-sm font-semibold text-terracotta">Open collection</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
