"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { adminFocusRing, adminNavItemClass } from "@/lib/admin-ui";

type NavItem = {
  href: string;
  label: string;
};

function isPeoplePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminPeopleMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pathSnapshot, setPathSnapshot] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close after client navigations (including back/forward) without a layout effect.
  if (pathname !== pathSnapshot) {
    setPathSnapshot(pathname);
    if (open) setOpen(false);
  }

  const sectionActive = items.some((item) => isPeoplePath(pathname, item.href));

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`${adminNavItemClass} gap-1 border-0 bg-transparent p-0 ${adminFocusRing} ${
          open || sectionActive
            ? "text-terracotta hover:text-terracotta-dark"
            : "text-ink hover:text-terracotta"
        }`}
      >
        People
        <span aria-hidden className="text-[0.55rem] leading-none text-current opacity-80">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute left-0 top-full z-50 mt-1 w-max min-w-[7.5rem] border border-line bg-paper py-0.5 shadow-[0_1px_2px_rgba(42,34,24,0.06)]"
        >
          <ul className="m-0 list-none p-0">
            {items.map((item) => {
              const itemActive = isPeoplePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={itemActive ? "page" : undefined}
                    className={`block px-3 py-1.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${adminFocusRing} ${
                      itemActive
                        ? "bg-sand/50 text-terracotta"
                        : "text-ink hover:bg-sand/55 hover:text-ink"
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
