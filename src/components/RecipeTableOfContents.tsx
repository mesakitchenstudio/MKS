"use client";

import { useState } from "react";
import type { RecipeTocItem } from "@/lib/recipe-sections";

export function RecipeTableOfContents({ items }: { items: RecipeTocItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length < 2) return null;

  return (
    <nav aria-label="On this page" className="mt-8 scroll-mt-24">
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink"
        >
          On this page
          <span aria-hidden className="text-muted">
            {open ? "−" : "+"}
          </span>
        </button>
        {open ? (
          <ul className="border border-t-0 border-line bg-paper px-4 py-3 text-sm leading-7">
            {items.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="font-semibold text-terracotta hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="hidden md:block">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
          On this page
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="font-semibold text-terracotta underline-offset-2 hover:underline"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
