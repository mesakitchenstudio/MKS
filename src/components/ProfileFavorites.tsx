"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { MemberSessionExpiredError } from "@/lib/auth-client";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { removeLike } from "@/lib/likes";
import { authFocusRing } from "@/lib/auth-ui";

export function ProfileFavorites({
  recipes,
  extras = [],
}: {
  recipes: Recipe[];
  extras?: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const browseRef = useRef<HTMLAnchorElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = recipes.filter((recipe) => !hidden.includes(recipe.slug));
  const visibleExtras = extras.filter((item) => !hidden.includes(item.slug));
  const remaining = visible.length + visibleExtras.length;
  const startedWithFavorites = recipes.length + extras.length > 0;
  const remainingLabel =
    remaining === 1 ? "1 saved recipe" : `${remaining} saved recipes`;

  useEffect(() => {
    if (startedWithFavorites && remaining === 0) {
      browseRef.current?.focus();
    }
  }, [remaining, startedWithFavorites]);

  async function remove(slug: string, title: string) {
    setHidden((current) => [...current, slug]);
    try {
      await removeLike({ slug, title });
      router.refresh();
    } catch (error) {
      setHidden((current) => current.filter((item) => item !== slug));
      if (error instanceof MemberSessionExpiredError) {
        router.refresh();
        window.dispatchEvent(new Event("mesa-open-auth"));
        return;
      }
    }
  }

  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-muted">Recipes you save are collected here.</p>
        {remaining > 0 ? <p className="text-sm text-muted">{remainingLabel}</p> : null}
      </div>

      {remaining === 0 ? (
        <FavoritesEmptyState browseRef={browseRef} />
      ) : (
        <>
          {visible.length ? (
            <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((recipe) => {
                const dishLabel = resolveRecipeCardTitle(recipe);
                return (
                  <RecipeGridCard
                    key={recipe.slug}
                    recipe={recipe}
                    compact
                    mediaOverlay={
                      <button
                        type="button"
                        aria-label={`Remove ${dishLabel} from favorites`}
                        onClick={() => void remove(recipe.slug, recipe.title)}
                        className={`group/heart flex h-11 w-11 items-center justify-center rounded-full bg-paper/95 shadow-sm transition-colors hover:bg-terracotta ${authFocusRing}`}
                      >
                        <HeartIcon />
                      </button>
                    }
                  />
                );
              })}
            </div>
          ) : null}
          {visibleExtras.length ? (
            <ul className="mt-6 space-y-2 text-sm">
              {visibleExtras.map((save) => (
                <li key={save.slug} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/recipes/${save.slug}`}
                    className={`min-w-0 break-words font-semibold hover:text-terracotta ${authFocusRing} rounded-sm`}
                  >
                    {save.title}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Remove ${save.title} from favorites`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-sand ${authFocusRing}`}
                    onClick={() => void remove(save.slug, save.title)}
                  >
                    <HeartIcon />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </>
  );
}

export function FavoritesEmptyState({
  browseRef,
}: {
  browseRef?: RefObject<HTMLAnchorElement | null>;
} = {}) {
  return (
    <div className="mt-6 max-w-md">
      <p className="text-sm font-semibold text-ink">No saved recipes yet.</p>
      <p className="mt-1.5 text-sm leading-6 text-muted">
        Save recipes you love and they&apos;ll appear here.
      </p>
      <Link
        ref={browseRef}
        href="/recipes"
        className={`mt-4 inline-block rounded-sm text-sm font-semibold text-terracotta transition-colors hover:text-terracotta-dark ${authFocusRing}`}
      >
        Browse recipes
      </Link>
    </div>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54Z"
        className="fill-terracotta stroke-terracotta group-hover/heart:fill-paper group-hover/heart:stroke-paper"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
