"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type NavItem = {
  href: string;
  label: string;
};

export function AdminPeopleMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const active = items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 ${active ? "text-terracotta" : ""}`}
      >
        People
        <span aria-hidden className={`text-[0.65rem] transition ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 min-w-[10rem] border border-line bg-paper py-1 shadow-sm"
        >
          {items.map((item) => {
            const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block px-4 py-2 text-sm font-semibold hover:bg-sand/60 ${
                  itemActive ? "text-terracotta" : "text-ink"
                }`}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
