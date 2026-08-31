import type { ReactNode } from "react";
import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeImage } from "@/components/RecipeImage";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function RecipeGridCard({
  recipe,
  large = false,
  compact = false,
  mediaOverlay,
  imageAspect = "5/4",
}: {
  recipe: Recipe;
  large?: boolean;
  /** Omits excerpt and timing — used on profile favorites. */
  compact?: boolean;
  /** Rendered over the image, outside the card link (e.g. favorite control). */
  mediaOverlay?: ReactNode;
  imageAspect?: "5/4" | "4/3";
}) {
  const aspectClass =
    large ? "aspect-[4/3]" : imageAspect === "4/3" ? "aspect-[4/3]" : "aspect-[5/4]";

  const body = (
    <article>
      <div className={`relative overflow-hidden bg-sand ${aspectClass}`}>
        <RecipeImage
          src={recipe.image}
          alt={recipe.imageAlt}
          sizes={large ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
          className="object-cover transition duration-500 motion-safe:group-hover:scale-[1.02]"
        />
      </div>
      <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
        {recipe.course}
      </p>
      <h3
        className={`mt-1 line-clamp-2 font-serif leading-tight text-ink group-hover:text-terracotta group-focus-visible:text-terracotta ${large ? "text-2xl md:text-3xl" : "text-xl"}`}
      >
        {recipe.title}
      </h3>
      {compact ? null : (
        <>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{recipe.excerpt}</p>
          <p className="mt-2 text-xs text-muted">
            {formatTime(totalMinutes(recipe))} · {recipe.servings} {recipe.servingsUnit}
          </p>
        </>
      )}
    </article>
  );

  if (!mediaOverlay) {
    return (
      <Link href={`/recipes/${recipe.slug}`} className={`group block ${linkFocus}`}>
        {body}
      </Link>
    );
  }

  return (
    <div className="group relative">
      <Link href={`/recipes/${recipe.slug}`} className={`block ${linkFocus}`}>
        {body}
      </Link>
      <div className="absolute right-3 top-3 z-10">{mediaOverlay}</div>
    </div>
  );
}
