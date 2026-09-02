import Link from "next/link";
import { saveHomepageCurationAction } from "@/app/admin/actions";
import { assessHomepageRecipeEligibility } from "@/lib/homepage-eligibility";
import { adminFocusRing, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/lib/admin-ui";
import type { Recipe } from "@/data/types";

type RecipeOption = { id: string; slug: string; title: string };

export function HomepageCurationForm({
  recipes,
  featuredSlug,
  fromKitchenSlugs,
  fullRecipes,
}: {
  recipes: RecipeOption[];
  featuredSlug: string | null;
  fromKitchenSlugs: string[];
  fullRecipes: Recipe[];
}) {
  const featured = recipes.find((recipe) => recipe.slug === featuredSlug);
  const kitchen = fromKitchenSlugs.map((slug) => recipes.find((recipe) => recipe.slug === slug));

  function hintForSlug(slug: string) {
    const full = fullRecipes.find((recipe) => recipe.slug === slug);
    if (!full) return null;
    const { hardEligible, hardBlockers, softWarnings } = assessHomepageRecipeEligibility(full);
    if (hardEligible && softWarnings.length === 0) return null;
    if (!hardEligible) {
      return `Not homepage-eligible: ${hardBlockers.join(", ")}`;
    }
    return `Eligible with editorial warnings: ${softWarnings.join("; ")}`;
  }

  return (
    <section
      className="rounded-sm border border-line bg-paper px-4 py-5"
      aria-labelledby="homepage-curation-heading"
    >
      <h2 id="homepage-curation-heading" className="font-serif text-2xl text-ink">
        Homepage curation
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Featured hero and an optional three-recipe &quot;From the kitchen&quot; row. Stock/Unsplash
        imagery is allowed with a soft warning — only missing or broken images block homepage
        display.
      </p>

      {featured ? (
        <p className="mt-4 text-sm text-ink">
          Featured:{" "}
          <Link
            href={`/recipes/${featured.slug}`}
            className="font-semibold text-terracotta hover:underline"
          >
            {featured.title}
          </Link>
          {hintForSlug(featured.slug) ? (
            <span className="mt-1 block text-xs text-muted">{hintForSlug(featured.slug)}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">No featured recipe selected.</p>
      )}

      {kitchen.some(Boolean) ? (
        <ul className="mt-3 space-y-1 text-sm text-ink">
          {kitchen.map((row, index) =>
            row ? (
              <li key={row.slug}>
                From the kitchen {index + 1}:{" "}
                <Link href={`/recipes/${row.slug}`} className="font-semibold text-terracotta hover:underline">
                  {row.title}
                </Link>
                {hintForSlug(row.slug) ? (
                  <span className="mt-0.5 block text-xs text-muted">{hintForSlug(row.slug)}</span>
                ) : null}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

      <form action={saveHomepageCurationAction} className="mt-5 space-y-4">
        <div className="min-w-[min(100%,16rem)]">
          <label
            htmlFor="homepage-featured-slug"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Featured recipe (hero)
          </label>
          <select
            id="homepage-featured-slug"
            name="featuredRecipeSlug"
            defaultValue={featuredSlug ?? ""}
            className="mt-1 w-full border border-line bg-cream px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.slug}>
                {recipe.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index}>
              <label
                htmlFor={`homepage-kitchen-${index}`}
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                From the kitchen {index + 1}
              </label>
              <select
                id={`homepage-kitchen-${index}`}
                name={`fromKitchenSlug${index}`}
                defaultValue={fromKitchenSlugs[index] ?? ""}
                className="mt-1 w-full border border-line bg-cream px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.slug}>
                    {recipe.title}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Save homepage curation
          </button>
          {featuredSlug || fromKitchenSlugs.length ? (
            <button
              type="submit"
              name="clear"
              value="1"
              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            >
              Clear all selections
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
