"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AdminSidebarNav, adminMobileNavTriggerClass } from "@/components/admin/AdminSidebarNav";
import { Logo } from "@/components/Logo";
import type { AdminNavSection } from "@/lib/admin-nav";
import { adminPageTitleForPath, adminWorkspaceWidthForPath } from "@/lib/admin-nav";
import {
  adminFocusRing,
  adminMobileDrawerWidthClass,
  adminSidebarWidthClass,
  adminWorkspacePaddingClass,
} from "@/lib/admin-ui";

type AdminShellProps = {
  homeHref: string;
  displayName: string;
  roleLabel: string;
  sections: AdminNavSection[];
  children: React.ReactNode;
};

export function AdminShell({
  homeHref,
  displayName,
  roleLabel,
  sections,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pathSnapshot, setPathSnapshot] = useState(pathname);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const pageTitle = adminPageTitleForPath(pathname, sections);
  const workspaceWidth = adminWorkspaceWidthForPath(pathname);

  if (pathname !== pathSnapshot) {
    setPathSnapshot(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  function closeMobileNav() {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={`no-print hidden ${adminSidebarWidthClass} shrink-0 flex-col border-r border-line/80 bg-paper/70 lg:sticky lg:top-0 lg:flex lg:h-dvh`}
      >
        <div className="border-b border-line/80 px-4 py-4">
          <Logo href={homeHref} aside="Admin" className="scale-[0.92] origin-left" />
        </div>
        <AdminSidebarNav
          sections={sections}
          displayName={displayName}
          roleLabel={roleLabel}
        />
      </aside>

      {/* Mobile header */}
      <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-line/80 bg-paper/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          className={adminMobileNavTriggerClass()}
          aria-expanded={mobileOpen}
          aria-controls={drawerId}
          onClick={() => setMobileOpen(true)}
        >
          Menu
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight text-ink">{pageTitle}</p>
          <p className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            Mesa admin
          </p>
        </div>
        <Link
          href={homeHref}
          className={`shrink-0 font-serif text-lg text-ink ${adminFocusRing}`}
          aria-label="Admin home"
        >
          M
        </Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close navigation"
            onClick={closeMobileNav}
          />
          <div
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className={`relative flex h-full ${adminMobileDrawerWidthClass} flex-col border-r border-line bg-paper shadow-none`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line/80 px-4 py-3">
              <Logo href={homeHref} aside="Admin" className="scale-[0.92] origin-left" />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMobileNav}
                className={`${adminMobileNavTriggerClass()} shrink-0`}
              >
                Close
              </button>
            </div>
            <AdminSidebarNav
              sections={sections}
              displayName={displayName}
              roleLabel={roleLabel}
              onNavigate={closeMobileNav}
            />
          </div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1">
        <div className={adminWorkspacePaddingClass}>
          <div className={`w-full ${workspaceWidth}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}
