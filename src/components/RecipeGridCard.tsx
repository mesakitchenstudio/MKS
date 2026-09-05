import type { ReactNode } from "react";
import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeImage } from "@/components/RecipeImage";
import { recipePrimaryCategoryDisplayLabel } from "@/lib/recipe-primary-taxonomy";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function RecipeGridCard({
  recipe,
  large = false,
  compact = false,
  mediaOverlay,
  imageAspect = "5/4",
  variant = "default",
  excerptLines,
  onNavigate,
}: {
  recipe: Recipe;
  large?: boolean;
  /** Omits excerpt and timing — used on profile favorites. */
  compact?: boolean;
  /** Rendered over the image, outside the card link (e.g. favorite control). */
  mediaOverlay?: ReactNode;
  imageAspect?: "5/4" | "4/3";
  /** Discovery cards use a fixed short image for end-of-page recommendations. */
  variant?: "default" | "discovery";
  /** Override excerpt line clamp (homepage Latest uses 2). */
  excerptLines?: 2 | 3;
  /** Fires on card navigation without blocking the link. */
  onNavigate?: () => void;
}) {
  const aspectClass =
    large ? "aspect-[4/3]" : imageAspect === "4/3" ? "aspect-[4/3]" : "aspect-[5/4]";

  const discovery = variant === "discovery";
  const excerptClamp = excerptLines ?? (discovery ? 2 : 3);
  const excerptClampClass = excerptClamp === 2 ? "line-clamp-2" : "line-clamp-3";
  const cardTitle = resolveRecipeCardTitle(recipe);
  const excerpt = recipe.excerpt.trim();

  const imageBlock = discovery ? (
    <div className="relative h-40 w-full shrink-0 overflow-hidden bg-sand md:h-44">
      <RecipeImage
        src={recipe.image}
        alt={recipe.imageAlt}
        sizes="(min-width: 1024px) 20vw, (min-width: 640px) 40vw, 90vw"
        className="object-cover transition duration-700 ease-out motion-safe:group-hover:scale-[1.025] motion-safe:group-focus-visible:scale-[1.025]"
      />
    </div>
  ) : (
    <div className={`relative shrink-0 overflow-hidden bg-sand ${aspectClass}`}>
      <RecipeImage
        src={recipe.image}
        alt={recipe.imageAlt}
        sizes={large ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
        className="object-cover transition duration-700 ease-out motion-safe:group-hover:scale-[1.025] motion-safe:group-focus-visible:scale-[1.025]"
      />
    </div>
  );

  const body = (
    <article className="flex h-full flex-col">
      {imageBlock}
      <div className="flex min-h-0 flex-1 flex-col">
        <p
          className={`font-semibold uppercase tracking-[0.16em] text-olive ${
            discovery ? "mt-2 text-[0.65rem]" : "mt-3 text-[0.7rem]"
          }`}
        >
          {recipePrimaryCategoryDisplayLabel(recipe)}
        </p>
        <h3
          className={`mt-0.5 line-clamp-2 font-serif leading-snug text-ink transition-colors duration-300 group-hover:text-terracotta group-focus-visible:text-terracotta ${
            large ? "text-2xl md:text-3xl" : discovery ? "text-lg" : "text-xl"
          }`}
        >
          {cardTitle}
        </h3>
        {compact ? null : (
          <>
            {excerpt ? (
              <p
                className={`text-muted ${
                  discovery
                    ? `mt-1 ${excerptClampClass} text-sm leading-5`
                    : `mt-2 ${excerptClampClass} text-sm leading-6`
                }`}
              >
                {excerpt}
              </p>
            ) : null}
            <p className={`mt-auto text-muted ${discovery ? "pt-1 text-xs" : "pt-2 text-xs"}`}>
              {formatTime(totalMinutes(recipe))} · {recipe.servings} {recipe.servingsUnit}
            </p>
          </>
        )}
      </div>
    </article>
  );

  if (!mediaOverlay) {
    return (
      <Link
        href={`/recipes/${recipe.slug}`}
        className={`group flex h-full flex-col ${linkFocus}`}
        onClick={onNavigate}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="group relative h-full">
      <Link
        href={`/recipes/${recipe.slug}`}
        className={`flex h-full flex-col ${linkFocus}`}
        onClick={onNavigate}
      >
        {body}
      </Link>
      <div className="absolute right-3 top-3 z-10">{mediaOverlay}</div>
    </div>
  );
}
