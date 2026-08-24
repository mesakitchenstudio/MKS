"use client";

import Link from "next/link";
import { signOut as signOutGoogle, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { firstName, readSession, signOut, type PublicUser } from "@/lib/auth-client";

export function AccountMenu() {
  const { data } = useSession();
  const [localUser, setLocalUser] = useState<PublicUser | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  const user: PublicUser | null = data?.user?.email
    ? {
        name: data.user.name?.trim() || localUser?.name || data.user.email,
        email: data.user.email,
      }
    : localUser;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("mesa-open-auth"))}
        className="text-sm font-semibold tracking-wide text-ink/80 hover:text-terracotta"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="max-w-[10rem] truncate rounded-full border border-olive/40 bg-cream px-3 py-1.5 text-sm font-semibold text-ink hover:border-olive"
      >
        {firstName(user)}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-sm border border-line bg-paper p-3 shadow-lg">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          {data?.staffRole ? (
            <Link
              href="/admin"
              className="mt-3 block text-xs font-semibold text-olive hover:text-olive-dark"
              onClick={() => setOpen(false)}
            >
              Studio admin
            </Link>
          ) : (
            <Link
              href="/profile"
              className="mt-3 block text-xs font-semibold text-olive hover:text-olive-dark"
              onClick={() => setOpen(false)}
            >
              Your profile
            </Link>
          )}
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-muted hover:text-terracotta"
            onClick={() => {
              signOut();
              void signOutGoogle({ redirect: false });
              setOpen(false);
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
