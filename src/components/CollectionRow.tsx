import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function CollectionRow({
  title,
  description,
  href,
  viewMoreLabel = "View more",
  recipes,
  uniformCards = false,
  compactDiscovery = false,
}: {
  title: string;
  description?: string;
  href?: string;
  viewMoreLabel?: string;
  recipes: Recipe[];
  /** Consistent 4:3 cards for recipe-page related row. */
  uniformCards?: boolean;
  /** Shorter end-of-page discovery cards on recipe pages. */
  compactDiscovery?: boolean;
}) {
  if (!recipes.length) return null;

  const gridClass =
    recipes.length >= 3
      ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : "grid gap-4 sm:grid-cols-2";

  const cardVariant = compactDiscovery ? "discovery" : "default";
  const imageAspect = uniformCards && !compactDiscovery ? "4/3" : "5/4";

  return (
    <section className={`mx-auto max-w-[75rem] px-4 md:px-6 ${compactDiscovery ? "py-6" : "py-8"}`}>
      <div className={`flex items-end justify-between gap-4 ${compactDiscovery ? "mb-4" : "mb-5"}`}>
        <div>
          <h2
            className={`font-serif text-ink ${compactDiscovery ? "text-2xl" : "text-3xl md:text-4xl"}`}
          >
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className={`shrink-0 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${linkFocus}`}
          >
            {viewMoreLabel}
          </Link>
        ) : null}
      </div>
      <div className={gridClass}>
        {recipes.map((recipe) => (
          <RecipeGridCard
            key={recipe.slug}
            recipe={recipe}
            variant={cardVariant}
            imageAspect={imageAspect}
          />
        ))}
      </div>
    </section>
  );
}
