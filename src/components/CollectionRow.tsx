"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Recipe } from "@/data/types";
import { recipeContentShellClass } from "@/components/RecipeContentShell";
import { RecipeGridCard } from "./RecipeGridCard";
import { trackEvent } from "@/lib/analytics";
import {
  shelfCanScrollNext,
  shelfCanScrollPrevious,
  shelfScrollStep,
} from "@/lib/recipe-related-shelf";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const arrowClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-olive hover:text-olive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:pointer-events-none disabled:opacity-35";

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

  const cardVariant = compactDiscovery ? "discovery" : "default";
  const imageAspect = uniformCards && !compactDiscovery ? "4/3" : "5/4";
  const useShelf = compactDiscovery;

  return (
    <section className={`${recipeContentShellClass} ${compactDiscovery ? "py-6" : "py-8"}`}>
      {useShelf ? (
        <RelatedRecipeShelf
          title={title}
          description={description}
          href={href}
          viewMoreLabel={viewMoreLabel}
          recipes={recipes}
          cardVariant={cardVariant}
          imageAspect={imageAspect}
        />
      ) : (
        <>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-3xl text-ink md:text-4xl">{title}</h2>
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
          <div
            className={
              recipes.length >= 3
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                : "grid gap-4 sm:grid-cols-2"
            }
          >
            {recipes.map((recipe) => (
              <RecipeGridCard
                key={recipe.slug}
                recipe={recipe}
                variant={cardVariant}
                imageAspect={imageAspect}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function RelatedRecipeShelf({
  title,
  description,
  href,
  viewMoreLabel,
  recipes,
  cardVariant,
  imageAspect,
}: {
  title: string;
  description?: string;
  href?: string;
  viewMoreLabel: string;
  recipes: Recipe[];
  cardVariant: "default" | "discovery";
  imageAspect: "5/4" | "4/3";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const syncControls = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const { scrollLeft, clientWidth, scrollWidth } = scroller;
    const overflow = scrollWidth > clientWidth + 2;
    setShowControls(overflow);
    setCanPrev(shelfCanScrollPrevious(scrollLeft));
    setCanNext(shelfCanScrollNext(scrollLeft, clientWidth, scrollWidth));
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    syncControls();
    scroller.addEventListener("scroll", syncControls, { passive: true });
    const ro = new ResizeObserver(() => syncControls());
    ro.observe(scroller);
    for (const child of Array.from(scroller.children)) {
      if (child instanceof HTMLElement) ro.observe(child);
    }
    return () => {
      scroller.removeEventListener("scroll", syncControls);
      ro.disconnect();
    };
  }, [recipes, syncControls]);

  function scrollByDirection(direction: "previous" | "next") {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const item = scroller.querySelector<HTMLElement>("[data-shelf-item]");
    const styles = getComputedStyle(scroller);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    const step = shelfScrollStep({
      itemWidth: item?.offsetWidth ?? 0,
      gap,
      viewportWidth: scroller.clientWidth,
    });
    scroller.scrollBy({
      left: direction === "next" ? step : -step,
      behavior: "smooth",
    });
    trackEvent("recipe_related_scroll", {
      direction,
      placement: "more_from_studio",
    });
    window.requestAnimationFrame(syncControls);
  }

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showControls ? (
            <>
              <button
                type="button"
                aria-label="Previous recipes"
                disabled={!canPrev}
                onClick={() => scrollByDirection("previous")}
                className={arrowClass}
              >
                <span aria-hidden className="text-lg leading-none">
                  ←
                </span>
              </button>
              <button
                type="button"
                aria-label="Next recipes"
                disabled={!canNext}
                onClick={() => scrollByDirection("next")}
                className={arrowClass}
              >
                <span aria-hidden className="text-lg leading-none">
                  →
                </span>
              </button>
            </>
          ) : null}
          {href ? (
            <Link
              href={href}
              className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${linkFocus}`}
            >
              {viewMoreLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        data-related-shelf
      >
        {recipes.map((recipe) => (
          <div
            key={recipe.slug}
            data-shelf-item
            className="w-[min(100%,calc(100%-1.5rem))] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]"
          >
            <RecipeGridCard recipe={recipe} variant={cardVariant} imageAspect={imageAspect} />
          </div>
        ))}
      </div>
    </>
  );
}
