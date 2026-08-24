"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Recipe } from "@/data/types";
import { removeLike } from "@/lib/likes";

export function ProfileFavorites({
  recipes,
  extras = [],
}: {
  recipes: Recipe[];
  extras?: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = recipes.filter((recipe) => !hidden.includes(recipe.slug));
  const visibleExtras = extras.filter((item) => !hidden.includes(item.slug));

  async function remove(slug: string, title: string) {
    setHidden((current) => [...current, slug]);
    await removeLike({ slug, title });
    router.refresh();
  }

  if (!visible.length && !visibleExtras.length) {
    return (
      <p className="mt-8 border border-line bg-paper px-5 py-8 text-sm text-muted">
        Open a recipe and tap the heart to save it here.
      </p>
    );
  }

  return (
    <>
      {visible.length ? (
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((recipe) => (
            <article key={recipe.slug} className="group">
              <div className="relative aspect-[5/4] overflow-hidden bg-sand">
                <Link href={`/recipes/${recipe.slug}`} className="absolute inset-0">
                  <Image
                    src={recipe.image}
                    alt={recipe.imageAlt}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </Link>
                <button
                  type="button"
                  aria-label={`Remove ${recipe.title} from favorites`}
                  onClick={() => void remove(recipe.slug, recipe.title)}
                  className="group/heart absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-paper/95 shadow-sm hover:bg-terracotta"
                >
                  <HeartIcon />
                </button>
              </div>
              <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
                {recipe.course}
              </p>
              <h3 className="mt-1 font-serif text-xl leading-tight">
                <Link href={`/recipes/${recipe.slug}`} className="hover:text-terracotta">
                  {recipe.title}
                </Link>
              </h3>
            </article>
          ))}
        </div>
      ) : null}
      {visibleExtras.length ? (
        <ul className="mt-6 space-y-2 text-sm">
          {visibleExtras.map((save) => (
            <li key={save.slug} className="flex items-center justify-between gap-3">
              <Link href={`/recipes/${save.slug}`} className="font-semibold hover:text-terracotta">
                {save.title}
              </Link>
              <button
                type="button"
                aria-label={`Remove ${save.title} from favorites`}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-sand"
                onClick={() => void remove(save.slug, save.title)}
              >
                <HeartIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
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
