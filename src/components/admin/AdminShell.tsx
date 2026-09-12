"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AdminSidebarNav, adminMobileNavTriggerClass } from "@/components/admin/AdminSidebarNav";
import { Logo } from "@/components/Logo";
import type { AdminNavSection } from "@/lib/admin-nav";
import { adminPageTitleForPath, adminWorkspaceWidthForPath } from "@/lib/admin-nav";
import type { AdminDeployInfo } from "@/lib/admin-deploy";
import { formatAdminDeployLine } from "@/lib/admin-deploy";
import {
  ADMIN_PRESENCE_HEARTBEAT_MS,
  shouldRunAdminPresenceHeartbeat,
} from "@/lib/admin-session-presence";
import {
  ADMIN_SIDEBAR_DEFAULT_WIDTH_PX,
  ADMIN_SIDEBAR_MAX_WIDTH_PX,
  ADMIN_SIDEBAR_MIN_WIDTH_PX,
  adminSidebarWidthFromKeyboard,
  adminSidebarWidthFromPointerDelta,
  getAdminSidebarWidthServerSnapshot,
  getAdminSidebarWidthSnapshot,
  subscribeAdminSidebarWidth,
  writeAdminSidebarWidthToStorage,
} from "@/lib/admin-sidebar-width";
import {
  adminFocusRing,
  adminMobileDrawerWidthClass,
  adminMobileDrawerZClass,
  adminSidebarFocusRing,
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
  notificationUnreadCount?: number;
  children: React.ReactNode;
};

export function AdminShell({
  homeHref,
  displayName,
  roleLabel,
  sections,
  deployInfo,
  notificationUnreadCount = 0,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const propsIdentity: ShellIdentity = { homeHref, displayName, roleLabel, sections };
  const [fetchedIdentity, setFetchedIdentity] = useState<ShellIdentity | null>(null);
  const [propsSnapshot, setPropsSnapshot] = useState(propsIdentity);
  if (
    propsSnapshot.homeHref !== propsIdentity.homeHref ||
    propsSnapshot.displayName !== propsIdentity.displayName ||
    propsSnapshot.roleLabel !== propsIdentity.roleLabel ||
    propsSnapshot.sections !== propsIdentity.sections
  ) {
    setPropsSnapshot(propsIdentity);
    setFetchedIdentity(null);
  }
  const identity = fetchedIdentity ?? propsIdentity;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pathSnapshot, setPathSnapshot] = useState(pathname);
  const storedSidebarWidth = useSyncExternalStore(
    subscribeAdminSidebarWidth,
    getAdminSidebarWidthSnapshot,
    getAdminSidebarWidthServerSnapshot,
  );
  const [dragSidebarWidth, setDragSidebarWidth] = useState<number | null>(null);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const sidebarWidth = dragSidebarWidth ?? storedSidebarWidth;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(ADMIN_SIDEBAR_DEFAULT_WIDTH_PX);
  const liveSidebarWidthRef = useRef(ADMIN_SIDEBAR_DEFAULT_WIDTH_PX);
  const drawerId = useId();
  const pageTitle = adminPageTitleForPath(pathname, identity.sections);
  const workspaceWidth = adminWorkspaceWidthForPath(pathname);

  const commitSidebarWidth = useCallback((next: number) => {
    const width = writeAdminSidebarWidthToStorage(next);
    liveSidebarWidthRef.current = width;
    setDragSidebarWidth(null);
    return width;
  }, []);

  // Soft navigations can keep a cached layout payload; re-sync identity from the DB.
  useEffect(() => {
    let cancelled = false;
    const baselineProps: ShellIdentity = { homeHref, displayName, roleLabel, sections };

    async function syncIdentity() {
      try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          window.location.href = "/admin/login?reason=session-revoked";
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
        setFetchedIdentity((current) => {
          const baseline = current ?? baselineProps;
          const changed =
            baseline.roleLabel !== next.roleLabel ||
            baseline.homeHref !== next.homeHref ||
            baseline.displayName !== next.displayName ||
            JSON.stringify(baseline.sections) !== JSON.stringify(next.sections);
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
  }, [pathname, router, homeHref, displayName, roleLabel, sections]);

  // Dedicated Admin presence heartbeat — keeps AdminSession.lastSeenAt fresh while visible.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let lastSentAt = 0;
    const minGapMs = 5_000;

    async function beat(force = false) {
      if (cancelled) return;
      if (!shouldRunAdminPresenceHeartbeat(document.visibilityState)) return;
      const now = Date.now();
      if (!force && now - lastSentAt < minGapMs) return;
      lastSentAt = now;
      try {
        const response = await fetch("/api/admin/presence", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 401) {
          window.location.href = "/admin/login?reason=session-revoked";
        }
      } catch {
        // Next interval retries; do not crash Admin.
      }
    }

    function startInterval() {
      window.clearInterval(timer);
      timer = window.setInterval(() => void beat(true), ADMIN_PRESENCE_HEARTBEAT_MS);
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void beat(true);
      startInterval();
    }

    function onFocus() {
      void beat(false);
    }

    void beat(true);
    startInterval();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

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

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = dragSidebarWidth ?? storedSidebarWidth;
    liveSidebarWidthRef.current = dragStartWidthRef.current;
    setSidebarDragging(true);
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = adminSidebarWidthFromPointerDelta(
      dragStartWidthRef.current,
      dragStartXRef.current,
      event.clientX,
    );
    liveSidebarWidthRef.current = next;
    setDragSidebarWidth(next);
  }

  function endResizeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setSidebarDragging(false);
    commitSidebarWidth(liveSidebarWidthRef.current);
  }

  function onResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = dragSidebarWidth ?? storedSidebarWidth;
    const next = adminSidebarWidthFromKeyboard(current, event.key);
    if (next == null) return;
    event.preventDefault();
    commitSidebarWidth(next);
  }

  function onResizeDoubleClick() {
    commitSidebarWidth(ADMIN_SIDEBAR_DEFAULT_WIDTH_PX);
  }

  useEffect(() => {
    if (!sidebarDragging) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [sidebarDragging]);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside
        className="no-print relative hidden min-w-0 shrink-0 flex-col overflow-x-hidden border-r border-line/80 bg-paper/70 lg:sticky lg:top-0 lg:flex lg:h-dvh"
        style={{ width: sidebarWidth }}
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
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={ADMIN_SIDEBAR_MIN_WIDTH_PX}
          aria-valuemax={ADMIN_SIDEBAR_MAX_WIDTH_PX}
          aria-valuenow={sidebarWidth}
          aria-label="Resize navigation sidebar"
          tabIndex={0}
          className={`absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none lg:block ${adminSidebarFocusRing} ${
            sidebarDragging ? "bg-olive/25" : "bg-transparent hover:bg-olive/15"
          }`}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResizeDrag}
          onPointerCancel={endResizeDrag}
          onKeyDown={onResizeKeyDown}
          onDoubleClick={onResizeDoubleClick}
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
        {notificationUnreadCount > 0 ? (
          <Link
            href="/admin/notifications"
            className={`${adminFocusRing} rounded-sm px-2 py-1 text-xs font-semibold text-terracotta`}
            aria-label={`${notificationUnreadCount} unread notifications`}
          >
            {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
          </Link>
        ) : null}
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
          <div className={`min-w-0 w-full ${workspaceWidth}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}
