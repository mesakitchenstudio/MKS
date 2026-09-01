"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AdminSidebarNav, adminMobileNavTriggerClass } from "@/components/admin/AdminSidebarNav";
import { Logo } from "@/components/Logo";
import type { AdminNavSection } from "@/lib/admin-nav";
import { adminPageTitleForPath, adminWorkspaceWidthForPath } from "@/lib/admin-nav";
import type { AdminDeployInfo } from "@/lib/admin-deploy";
import { formatAdminDeployLine } from "@/lib/admin-deploy";
import {
  adminFocusRing,
  adminMobileDrawerWidthClass,
  adminMobileDrawerZClass,
  adminSidebarWidthClass,
  adminWorkspacePaddingClass,
} from "@/lib/admin-ui";

type ShellIdentity = {
  homeHref: string;
  displayName: string;
  roleLabel: string;
  sections: AdminNavSection[];
};

type AdminShellProps = ShellIdentity & {
  deployInfo: AdminDeployInfo;
  children: React.ReactNode;
};

export function AdminShell({
  homeHref,
  displayName,
  roleLabel,
  sections,
  deployInfo,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<ShellIdentity>({
    homeHref,
    displayName,
    roleLabel,
    sections,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pathSnapshot, setPathSnapshot] = useState(pathname);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const pageTitle = adminPageTitleForPath(pathname, identity.sections);
  const workspaceWidth = adminWorkspaceWidthForPath(pathname);

  // Prefer fresh SSR props when the layout actually re-renders.
  useEffect(() => {
    setIdentity({ homeHref, displayName, roleLabel, sections });
  }, [homeHref, displayName, roleLabel, sections]);

  // Soft navigations can keep a cached layout payload; re-sync identity from the DB.
  useEffect(() => {
    let cancelled = false;

    async function syncIdentity() {
      try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as ShellIdentity & { role?: string };
        if (cancelled) return;
        const next: ShellIdentity = {
          homeHref: data.homeHref,
          displayName: data.displayName,
          roleLabel: data.roleLabel,
          sections: data.sections,
        };
        setIdentity((current) => {
          const changed =
            current.roleLabel !== next.roleLabel ||
            current.homeHref !== next.homeHref ||
            current.displayName !== next.displayName ||
            JSON.stringify(current.sections) !== JSON.stringify(next.sections);
          if (changed) {
            // Refresh RSC tree so page redirects/nav match the new role.
            router.refresh();
          }
          return next;
        });
      } catch {
        // Keep SSR identity if the sync request fails.
      }
    }

    void syncIdentity();

    function onVisible() {
      if (document.visibilityState === "visible") void syncIdentity();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pathname, router]);

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
          <Logo href={identity.homeHref} aside="Admin" className="scale-[0.92] origin-left" />
        </div>
        <AdminSidebarNav
          sections={identity.sections}
          displayName={identity.displayName}
          roleLabel={identity.roleLabel}
          deployInfo={deployInfo}
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
          <p
            className="truncate font-mono text-[0.65rem] tracking-wide text-olive"
            title={
              deployInfo.fullSha
                ? `Deployed commit ${deployInfo.fullSha} (${deployInfo.envLabel})`
                : "Local development build"
            }
          >
            {formatAdminDeployLine(deployInfo)}
          </p>
        </div>
        <Link
          href={identity.homeHref}
          className={`shrink-0 font-serif text-lg text-ink ${adminFocusRing}`}
          aria-label="Admin home"
        >
          M
        </Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className={`fixed inset-0 ${adminMobileDrawerZClass} lg:hidden`} role="presentation">
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
            className={`fixed inset-y-0 left-0 z-10 flex h-dvh max-h-dvh min-h-0 ${adminMobileDrawerWidthClass} flex-col overflow-hidden border-r border-line bg-paper shadow-none`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <Logo href={identity.homeHref} aside="Admin" className="scale-[0.92] origin-left" />
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
              sections={identity.sections}
              displayName={identity.displayName}
              roleLabel={identity.roleLabel}
              deployInfo={deployInfo}
              onNavigate={closeMobileNav}
              compactScroll
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
