"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { megaMenu } from "@/data/categories";
import { buildRecipesUrl } from "@/lib/recipe-discovery";
import {
  PUBLIC_HEADER_NAV_FOCUS,
  RECIPES_DISCLOSURE_LABEL,
  RECIPES_DROPDOWN_ID,
  isRecipesSectionActive,
  recipesNavAriaCurrent,
} from "@/lib/public-header-recipes";
import { PUBLIC_HEADER_NAV, PUBLIC_MOBILE_NAV } from "@/lib/public-nav";
import {
  PRIMARY_CATEGORY_LABELS,
  type PrimaryCategorySlug,
} from "@/lib/recipe-primary-taxonomy";
import { Logo } from "./Logo";
import { AccountMenu } from "./AccountMenu";

function primaryMegaLabel(slug: string) {
  if (slug in PRIMARY_CATEGORY_LABELS) {
    return PRIMARY_CATEGORY_LABELS[slug as PrimaryCategorySlug];
  }
  return slug;
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recipesMenuRef = useRef<HTMLDivElement>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);

  function closeMenus() {
    setOpen(false);
    setMegaOpen(false);
  }

  const onRecipesPage = pathname === "/recipes";
  const recipesActive = isRecipesSectionActive(pathname);
  const recipesCurrent = recipesNavAriaCurrent(pathname);

  useEffect(() => {
    if (!megaOpen) return;

    function onPointer(event: MouseEvent) {
      if (recipesMenuRef.current && !recipesMenuRef.current.contains(event.target as Node)) {
        setMegaOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMegaOpen(false);
        disclosureRef.current?.focus();
      }
    }

    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [megaOpen]);

  function focusPageSearch() {
    closeMenus();
    const field = document.getElementById("recipes-search");
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus();
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    router.push(next ? `/recipes?q=${encodeURIComponent(next)}` : "/recipes");
    setOpen(false);
  }

  return (
    <header className="site-header no-print sticky top-0 z-50 border-b border-line/80 bg-paper/90 backdrop-blur-md transition-transform duration-200 ease-out">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 md:px-6">
        <span onClick={closeMenus}>
          <Logo />
        </span>

        <nav className="hidden items-center gap-1 md:flex">
          {PUBLIC_HEADER_NAV.map((link) =>
            "mega" in link && link.mega ? (
              <div key={link.href} ref={recipesMenuRef} className="relative flex items-center">
                <Link
                  href={link.href}
                  onClick={closeMenus}
                  aria-current={recipesCurrent}
                  className={`px-3 py-2 text-sm font-semibold tracking-wide hover:text-terracotta ${PUBLIC_HEADER_NAV_FOCUS} ${
                    recipesActive || megaOpen ? "text-terracotta" : "text-ink/80"
                  }`}
                >
                  {link.label}
                </Link>
                <button
                  ref={disclosureRef}
                  type="button"
                  aria-expanded={megaOpen}
                  aria-controls={RECIPES_DROPDOWN_ID}
                  aria-label={RECIPES_DISCLOSURE_LABEL}
                  onClick={() => setMegaOpen((value) => !value)}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center text-ink/80 hover:text-terracotta ${PUBLIC_HEADER_NAV_FOCUS} ${
                    recipesActive || megaOpen ? "text-terracotta" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`text-[0.6rem] transition-transform duration-150 motion-reduce:transition-none ${
                      megaOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>
                {megaOpen ? (
                  <div
                    id={RECIPES_DROPDOWN_ID}
                    className="absolute left-0 top-full z-20 w-[17rem] rounded-sm border border-line bg-paper p-5 shadow-lg"
                  >
                    {megaMenu.map((column) => (
                      <ul key={column.label} className="space-y-2">
                        {column.slugs.map((slug) => (
                          <li key={slug}>
                            <Link
                              href={buildRecipesUrl({ category: slug })}
                              onClick={closeMenus}
                              className={`text-sm text-ink/80 hover:text-terracotta ${PUBLIC_HEADER_NAV_FOCUS}`}
                            >
                              {primaryMegaLabel(slug)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ))}
                    <Link
                      href="/recipes"
                      onClick={closeMenus}
                      className={`mt-4 inline-block border-t border-line pt-3 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${PUBLIC_HEADER_NAV_FOCUS}`}
                    >
                      View all recipes →
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenus}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`px-3 py-2 text-sm font-semibold tracking-wide hover:text-terracotta ${PUBLIC_HEADER_NAV_FOCUS} ${
                  pathname === link.href ? "text-terracotta" : "text-ink/80"
                }`}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        {onRecipesPage ? (
          <button
            type="button"
            onClick={focusPageSearch}
            className="ml-auto hidden rounded-full border border-line bg-cream/60 px-4 py-2 text-sm font-semibold text-ink/80 transition-colors hover:border-terracotta hover:text-terracotta md:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Search recipes
          </button>
        ) : (
          <form onSubmit={onSearch} className="ml-auto hidden items-center md:flex">
            <label className="sr-only" htmlFor="header-search">
              Search recipes
            </label>
            <input
              id="header-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes"
              className="w-48 rounded-full border border-line bg-cream/60 px-4 py-2 text-sm outline-none ring-terracotta/30 placeholder:text-muted focus:w-64 focus:border-terracotta focus:ring-2"
            />
          </form>
        )}

        <div className="ml-auto flex items-center gap-3 md:ml-4">
          <AccountMenu />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="text-lg leading-none">{open ? "×" : "☰"}</span>
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-paper px-4 py-5 md:hidden">
          {onRecipesPage ? (
            <button
              type="button"
              onClick={focusPageSearch}
              className="mb-4 w-full rounded-full border border-line bg-cream/60 px-4 py-2 text-sm font-semibold text-ink/80"
            >
              Search recipes
            </button>
          ) : (
            <form onSubmit={onSearch} className="mb-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search recipes"
                className="w-full rounded-full border border-line bg-cream/60 px-4 py-2 text-sm outline-none focus:border-terracotta"
              />
            </form>
          )}
          <div className="flex flex-col gap-3 text-base font-semibold">
            {PUBLIC_MOBILE_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenus}
                aria-current={pathname === link.href ? "page" : undefined}
                className={pathname === link.href ? "text-terracotta" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            {megaMenu.map((column) => (
              <div key={column.label}>
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
                  {column.label}
                </p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {column.slugs.map((slug) => (
                    <li key={slug}>
                      <Link
                        href={buildRecipesUrl({ category: slug })}
                        onClick={closeMenus}
                        className="text-sm text-ink/80"
                      >
                        {primaryMegaLabel(slug)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
