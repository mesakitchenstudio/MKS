"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { site } from "@/data/site";
import { readSession } from "@/lib/auth-client";
import { isLiked, toggleLike } from "@/lib/likes";

export type OverlayRecipe = {
  slug: string;
  title: string;
  image: string;
  imageAlt: string;
};

export function SearchOverlay({
  recipes,
  onClose,
}: {
  recipes: OverlayRecipe[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function refresh() {
      const next: Record<string, boolean> = {};
      for (const recipe of recipes) {
        next[recipe.slug] = isLiked(recipe.slug);
      }
      setLiked(next);
    }
    refresh();
    window.addEventListener("mesa-likes-changed", refresh);
    return () => window.removeEventListener("mesa-likes-changed", refresh);
  }, [recipes]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recipes;
    return recipes.filter((recipe) => recipe.title.toLowerCase().includes(needle));
  }, [query, recipes]);

  const latest = visible.slice(0, 8);
  const videos = visible.slice(0, 7);

  async function onLike(recipe: OverlayRecipe) {
    if (!readSession()) {
      window.dispatchEvent(new Event("mesa-need-auth"));
      return;
    }
    const likedNow = await toggleLike({ slug: recipe.slug, title: recipe.title });
    setLiked((current) => ({ ...current, [recipe.slug]: likedNow }));
  }

  return (
    <div className="no-print fixed inset-0 z-50 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="text-2xl leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        <label className="relative mx-auto block max-w-3xl">
          <span className="sr-only">Search</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            className="w-full rounded-full border border-line bg-cream/40 py-3.5 pl-6 pr-14 text-lg outline-none placeholder:text-muted focus:border-olive"
          />
          <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2">
            <SearchGlyph />
          </span>
        </label>

        <section className="mt-12">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">
            Latest
          </h2>
          {latest.length ? (
            <div className="mt-4 flex gap-5 overflow-x-auto pb-3">
              {latest.map((recipe) => (
                <article key={recipe.slug} className="w-40 shrink-0 md:w-44">
                  <div className="relative aspect-square overflow-hidden bg-sand">
                    <Link href={`/recipes/${recipe.slug}`} onClick={onClose}>
                      <Image
                        src={recipe.image}
                        alt={recipe.imageAlt}
                        fill
                        className="object-cover"
                        sizes="180px"
                      />
                    </Link>
                    <button
                      type="button"
                      aria-label={`Like ${recipe.title}`}
                      onClick={() => onLike(recipe)}
                      className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-paper/90 px-2 py-1 text-xs"
                    >
                      <HeartTiny filled={Boolean(liked[recipe.slug])} />
                      <span>{liked[recipe.slug] ? 1 : 0}</span>
                    </button>
                  </div>
                  <Link
                    href={`/recipes/${recipe.slug}`}
                    onClick={onClose}
                    className="mt-2 block font-serif text-sm leading-snug hover:text-terracotta"
                  >
                    {recipe.title}
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">No recipes match that search.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">
            Videos
          </h2>
          <div className="mt-4 flex gap-5 overflow-x-auto pb-3">
            {videos.map((recipe) => (
              <article key={`video-${recipe.slug}`} className="w-52 shrink-0 md:w-56">
                <a
                  href={site.social.youtube}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block aspect-video overflow-hidden bg-sand"
                >
                  <Image
                    src={recipe.image}
                    alt={recipe.imageAlt}
                    fill
                    className="object-cover"
                    sizes="240px"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/20">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper/90 text-ink">
                      ▶
                    </span>
                  </span>
                </a>
                <p className="mt-2 font-serif text-sm leading-snug">{recipe.title}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 15.5 20 20.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HeartTiny({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54Z"
        fill={filled ? "#C45C3E" : "none"}
        stroke={filled ? "#C45C3E" : "#2A2218"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
