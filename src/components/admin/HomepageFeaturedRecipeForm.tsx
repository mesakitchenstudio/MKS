import Link from "next/link";
import { saveHomepageFeaturedRecipeAction } from "@/app/admin/actions";
import { adminFocusRing, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/lib/admin-ui";

export function HomepageFeaturedRecipeForm({
  recipes,
  selectedSlug,
}: {
  recipes: { id: string; slug: string; title: string }[];
  selectedSlug: string | null;
}) {
  const selected = recipes.find((recipe) => recipe.slug === selectedSlug);

  return (
    <section
      className="rounded-sm border border-line bg-paper px-4 py-5"
      aria-labelledby="homepage-featured-heading"
    >
      <h2 id="homepage-featured-heading" className="font-serif text-2xl text-ink">
        Homepage featured recipe
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Optional editorial pick for the public homepage hero (&quot;From the studio&quot;). If the
        selection is unpublished or ineligible, the site falls back to the latest eligible recipe.
      </p>

      {selected ? (
        <p className="mt-4 text-sm text-ink">
          Current:{" "}
          <Link href={`/recipes/${selected.slug}`} className="font-semibold text-terracotta hover:underline">
            {selected.title}
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">No featured recipe selected.</p>
      )}

      <form action={saveHomepageFeaturedRecipeAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[min(100%,16rem)] flex-1">
          <label
            htmlFor="homepage-featured-slug"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Featured recipe
          </label>
          <select
            id="homepage-featured-slug"
            name="recipeSlug"
            defaultValue={selectedSlug ?? ""}
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
        <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
          Save featured recipe
        </button>
        {selectedSlug ? (
          <button
            type="submit"
            name="clear"
            value="1"
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Clear selection
          </button>
        ) : null}
      </form>
    </section>
  );
}
