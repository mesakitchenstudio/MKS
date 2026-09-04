"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { adminFocusRing } from "@/lib/admin-ui";

type RecipeTypeOption = {
  id: string;
  name: string;
};

const compactPrimaryClass =
  `inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-sm bg-terracotta px-3.5 py-2 text-sm font-semibold text-paper transition-[color,transform,background-color] duration-150 motion-reduce:transition-none hover:bg-terracotta-dark active:scale-[0.995] active:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 ${adminFocusRing}`;

const menuItemClass =
  "flex h-10 items-center px-3.5 text-sm font-semibold text-ink no-underline transition-[color,background-color] duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:bg-cream focus-visible:text-terracotta";

export function NewRecipeButton({
  types,
  className = "",
}: {
  types: RecipeTypeOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const menuId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (!menuRef.current) return;

      const items = itemRefs.current.filter((item): item is HTMLAnchorElement => item !== null);
      if (!items.length) return;

      const currentIndex = items.findIndex((item) => item === document.activeElement);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next =
          currentIndex === -1 ? 0 : currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[next]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev =
          currentIndex === -1 ? items.length - 1 : currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prev]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const actionClass = `${compactPrimaryClass} ${className}`;

  if (types.length === 0) {
    return (
      <Link href="/admin/types" className={actionClass}>
        New recipe
      </Link>
    );
  }

  if (types.length === 1) {
    return (
      <Link href={`/admin/recipes/new?type=${types[0].id}`} className={actionClass}>
        New recipe
      </Link>
    );
  }

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open) return;
          const items = itemRefs.current.filter((item): item is HTMLAnchorElement => item !== null);
          if (!items.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            items[0]?.focus();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            items[items.length - 1]?.focus();
          }
        }}
        className={`${compactPrimaryClass} w-full`}
      >
        New recipe
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={headingId}
          className="absolute right-0 top-[calc(100%+7px)] z-50 w-[10.625rem] max-w-[calc(100vw-2.5rem)] border border-line bg-[var(--paper)] py-1 shadow-[0_1px_2px_rgba(42,34,24,0.07),0_6px_20px_rgba(42,34,24,0.11)]"
        >
          <div id={headingId} className="px-3.5 pt-2.5 pb-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
              New recipe
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">Choose a type</p>
          </div>
          <div className="mx-3.5 border-t border-line" aria-hidden />
          <div className="py-1" role="none">
            {types.map((type, index) => (
              <Link
                key={type.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                href={`/admin/recipes/new?type=${type.id}`}
                role="menuitem"
                tabIndex={index === 0 ? 0 : -1}
                className={`${menuItemClass} ${adminFocusRing}`}
                onClick={() => setOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") setOpen(false);
                }}
              >
                {type.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
