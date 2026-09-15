"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  followTargetAction,
  getMemberFollowStateAction,
  unfollowTargetAction,
} from "@/app/profile/follow-actions";
import { authFocusRing } from "@/lib/auth-ui";
import { readSession } from "@/lib/auth-client";
import type { FollowTarget } from "@/lib/member-follows";

export type MemberFollowButtonTarget = FollowTarget & { name: string };

/**
 * Cache-safe Follow control for public Series/Category pages.
 * Does not receive server-resolved followed state (ISR-safe).
 * Resolves member follow state client-side after auth is known.
 * Signed-out: opens mesa-open-auth; never auto-follows after sign-in.
 */
export function MemberFollowButton({ target }: { target: MemberFollowButtonTarget }) {
  const { status: sessionStatus } = useSession();
  const [following, setFollowing] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const targetKey = `${target.type}:${target.id}`;

  useEffect(() => {
    function sync() {
      setSessionEpoch((n) => n + 1);
    }
    window.addEventListener("mesa-session-changed", sync);
    return () => window.removeEventListener("mesa-session-changed", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Yield so React does not treat follow-state resolution as sync setState-in-effect.
      await Promise.resolve();
      if (cancelled) return;

      setError(null);
      const signedIn = Boolean(readSession()) || sessionStatus === "authenticated";

      if (sessionStatus === "loading" && !readSession()) {
        return;
      }

      if (!signedIn || sessionStatus === "unauthenticated") {
        if (cancelled) return;
        setFollowing(false);
        setResolved(true);
        return;
      }

      setResolved(false);
      const result = await getMemberFollowStateAction({
        type: target.type,
        id: target.id,
      });
      if (cancelled) return;

      if (!result.ok) {
        if (result.error === "NOT_AUTHENTICATED" || result.error === "FEATURE_DISABLED") {
          setFollowing(false);
          setResolved(true);
          return;
        }
        setError(result.message);
        setResolved(true);
        return;
      }
      setFollowing(result.data.following);
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [target.id, target.type, targetKey, sessionStatus, sessionEpoch]);

  function openAuth() {
    window.dispatchEvent(new Event("mesa-open-auth"));
  }

  async function onToggle() {
    if (pending) return;
    setError(null);

    if (!readSession() && sessionStatus !== "authenticated") {
      openAuth();
      return;
    }

    setPending(true);
    try {
      const payload = { type: target.type, id: target.id };
      const result = following
        ? await unfollowTargetAction(payload)
        : await followTargetAction(payload);

      if (!result.ok) {
        if (result.error === "NOT_AUTHENTICATED") {
          openAuth();
          return;
        }
        setError(result.message);
        return;
      }
      setFollowing(result.data.following);
    } finally {
      setPending(false);
    }
  }

  const label = following ? `Following ${target.name}` : `Follow ${target.name}`;
  const visibleLabel = following ? "Following" : `Follow ${target.name}`;
  // Do not call readSession() during render — it is client-only and causes hydration mismatch.
  const busy = pending || (!resolved && sessionStatus === "authenticated");

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void onToggle()}
        disabled={pending}
        aria-pressed={following}
        aria-busy={busy || undefined}
        aria-label={label}
        className={`inline-flex min-h-11 max-w-full items-center rounded-sm text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${authFocusRing} ${
          following
            ? "text-ink/80 hover:text-terracotta"
            : "text-terracotta hover:text-terracotta-dark"
        }`}
      >
        <span className="truncate">{busy && !following ? "…" : visibleLabel}</span>
      </button>
      {error ? (
        <p className="mt-1 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
