"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut as signOutGoogle, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import {
  clearMemberPresenceOnLogout,
  firstName,
  memberIdentityLines,
  readSession,
  resolveMemberDisplayName,
  signOut,
  type PublicUser,
} from "@/lib/auth-client";

const menuItemClass =
  "flex w-full items-center px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-cream/80 focus-visible:bg-cream/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta";

const menuItemActiveClass = "bg-sand/60 text-ink";

const signOutClass =
  "flex w-full items-center px-4 py-3 text-left text-sm font-semibold text-muted transition-colors hover:bg-cream/80 hover:text-terracotta focus-visible:bg-cream/80 focus-visible:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta";

const triggerFocus =
  "rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function AccountMenu() {
  const { data, status } = useSession();
  const pathname = usePathname();
  const [localUser, setLocalUser] = useState<PublicUser | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile/");

  useEffect(() => {
    function sync() {
      setLocalUser(readSession());
    }
    sync();
    window.addEventListener("mesa-session-changed", sync);
    return () => window.removeEventListener("mesa-session-changed", sync);
  }, [data]);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Never keep showing a deleted member from localStorage after Auth.js rejected the session.
  const user: PublicUser | null =
    data?.error === "MemberDeleted" || data?.error === "SessionRevoked"
      ? null
      : data?.user?.email
        ? {
            name: resolveMemberDisplayName({
              name: data.user.name || localUser?.name,
              email: data.user.email,
            }),
            email: data.user.email,
          }
        : status === "loading"
          ? localUser
            ? {
                name: resolveMemberDisplayName(localUser),
                email: localUser.email,
              }
            : null
          : null;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("mesa-open-auth"))}
        className={`text-sm font-semibold tracking-wide text-ink/80 hover:text-terracotta ${triggerFocus}`}
      >
        Sign in
      </button>
    );
  }

  const identity = memberIdentityLines(user);

  return (
    <div className="relative" ref={root}>
      <button
        ref={triggerRef}
        type="button"
        id={`${menuId}-trigger`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`max-w-[10rem] truncate border px-3 py-1.5 text-sm font-semibold text-ink transition-colors ${triggerFocus} ${
          open
            ? "border-olive/70 bg-sand/70"
            : "border-olive/40 bg-cream hover:border-olive/60"
        }`}
      >
        {firstName(user)}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-sm border border-line bg-paper shadow-sm"
        >
          <div className="px-4 py-3.5" role="presentation">
            <p className="break-words text-sm font-semibold leading-snug text-ink">
              {identity.primary}
            </p>
            {identity.secondary ? (
              <p
                className="mt-1 break-words text-xs leading-5 text-muted"
                title={identity.secondary}
              >
                {identity.secondary}
              </p>
            ) : null}
          </div>

          <div className="border-t border-line" role="none" />

          {data?.staffRole ? (
            <Link
              href="/admin/session"
              role="menuitem"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              Studio admin
            </Link>
          ) : (
            <Link
              href="/profile"
              role="menuitem"
              aria-current={onProfile ? "page" : undefined}
              className={`${menuItemClass} ${onProfile ? menuItemActiveClass : ""}`}
              onClick={() => setOpen(false)}
            >
              Profile
            </Link>
          )}

          <div className="border-t border-line" role="none" />

          <button
            type="button"
            role="menuitem"
            className={signOutClass}
            onClick={() => {
              void (async () => {
                await clearMemberPresenceOnLogout();
                signOut();
                await signOutGoogle({ redirect: false });
                setOpen(false);
              })();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
