"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { categories, megaMenu } from "@/data/categories";
import { Logo } from "./Logo";
import { AccountMenu } from "./AccountMenu";

const links = [
  { href: "/recipes", label: "Recipes", mega: true },
  { href: "/studio", label: "Studio" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [query, setQuery] = useState("");

  function closeMenus() {
    setOpen(false);
    setMegaOpen(false);
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
    setOpen(false);
  }

  return (
    <header className="no-print sticky top-0 z-50 border-b border-line/80 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 md:px-6">
        <span onClick={closeMenus}>
          <Logo />
        </span>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) =>
            link.mega ? (
              <div
                key={link.href}
                className="relative"
                onMouseEnter={() => setMegaOpen(true)}
                onMouseLeave={() => setMegaOpen(false)}
              >
                <Link
                  href={link.href}
                  onClick={closeMenus}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold tracking-wide text-ink/80 hover:text-terracotta"
                >
                  {link.label}
                  <span aria-hidden className="text-[0.6rem]">
                    ▾
                  </span>
                </Link>
                {megaOpen ? (
                  <div className="absolute left-0 top-full z-20 w-[40rem] rounded-sm border border-line bg-paper p-6 shadow-lg">
                    <div className="grid grid-cols-4 gap-6">
                      {megaMenu.map((column) => (
                        <div key={column.label}>
                          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
                            {column.label}
                          </p>
                          <ul className="space-y-2">
                            {column.slugs.map((slug) => {
                              const category = categories.find((item) => item.slug === slug);
                              if (!category) return null;
                              return (
                                <li key={slug}>
                                  <Link
                                    href={`/category/${slug}`}
                                    onClick={closeMenus}
                                    className="text-sm text-ink/80 hover:text-terracotta"
                                  >
                                    {category.name}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <Link
                      href="/recipes"
                      onClick={closeMenus}
                      className="mt-5 inline-block text-sm font-semibold text-terracotta hover:text-terracotta-dark"
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
                className="px-3 py-2 text-sm font-semibold tracking-wide text-ink/80 hover:text-terracotta"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

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
          <form onSubmit={onSearch} className="mb-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes"
              className="w-full rounded-full border border-line bg-cream/60 px-4 py-2 text-sm outline-none focus:border-terracotta"
            />
          </form>
          <div className="flex flex-col gap-3 text-base font-semibold">
            <Link href="/recipes" onClick={closeMenus}>
              All recipes
            </Link>
            <Link href="/studio" onClick={closeMenus}>
              Studio
            </Link>
            <Link href="/about" onClick={closeMenus}>
              About
            </Link>
            <Link href="/contact" onClick={closeMenus}>
              Contact
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
            {megaMenu.map((column) => (
              <div key={column.label}>
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
                  {column.label}
                </p>
                <ul className="space-y-1.5">
                  {column.slugs.map((slug) => {
                    const category = categories.find((item) => item.slug === slug);
                    if (!category) return null;
                    return (
                      <li key={slug}>
                        <Link href={`/category/${slug}`} onClick={closeMenus} className="text-sm text-ink/80">
                          {category.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
