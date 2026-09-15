"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { unfollowTargetAction } from "@/app/profile/follow-actions";
import { authFocusRing } from "@/lib/auth-ui";
import type { MemberFollowList } from "@/lib/member-follows";

export function ProfileFollowingView({ initial }: { initial: MemberFollowList }) {
  const router = useRouter();
  const [series, setSeries] = useState(initial.series);
  const [categories, setCategories] = useState(initial.categories);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const empty = series.length === 0 && categories.length === 0;

  async function unfollow(target: { type: "series" | "category"; id: string }) {
    if (pendingId) return;
    setError(null);
    setPendingId(`${target.type}:${target.id}`);
    try {
      const result = await unfollowTargetAction(target);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (target.type === "series") {
        setSeries((rows) => rows.filter((row) => row.id !== target.id));
      } else {
        setCategories((rows) => rows.filter((row) => row.id !== target.id));
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (empty) {
    return (
      <div className="mt-10 max-w-xl">
        <p className="text-lg text-ink/90">You&apos;re not following anything yet.</p>
        <p className="mt-2 text-muted">
          Follow Collections and Topics from their public pages to see them here.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          <Link
            href="/series"
            className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${authFocusRing} rounded-sm`}
          >
            Browse Collections
          </Link>
          <Link
            href="/recipes"
            className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${authFocusRing} rounded-sm`}
          >
            Browse Recipes
          </Link>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-12">
      {error ? (
        <p className="text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}

      {series.length > 0 ? (
        <section aria-labelledby="following-collections-heading">
          <h2 id="following-collections-heading" className="font-serif text-2xl text-ink md:text-3xl">
            Collections
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {series.map((row) => {
              const key = `series:${row.id}`;
              const busy = pendingId === key;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                      Collection
                    </p>
                    <Link
                      href={`/series/${row.slug}`}
                      className={`mt-1 block truncate font-serif text-xl text-ink hover:text-terracotta ${authFocusRing} rounded-sm`}
                    >
                      {row.name}
                    </Link>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void unfollow({ type: "series", id: row.id })}
                    className={`inline-flex min-h-11 shrink-0 items-center self-start text-sm font-semibold text-ink/80 hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-60 sm:self-center ${authFocusRing} rounded-sm`}
                  >
                    {busy ? "…" : "Unfollow"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {categories.length > 0 ? (
        <section aria-labelledby="following-topics-heading">
          <h2 id="following-topics-heading" className="font-serif text-2xl text-ink md:text-3xl">
            Topics
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {categories.map((row) => {
              const key = `category:${row.id}`;
              const busy = pendingId === key;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                      Topic
                    </p>
                    <Link
                      href={`/category/${row.slug}`}
                      className={`mt-1 block truncate font-serif text-xl text-ink hover:text-terracotta ${authFocusRing} rounded-sm`}
                    >
                      {row.name}
                    </Link>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void unfollow({ type: "category", id: row.id })}
                    className={`inline-flex min-h-11 shrink-0 items-center self-start text-sm font-semibold text-ink/80 hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-60 sm:self-center ${authFocusRing} rounded-sm`}
                  >
                    {busy ? "…" : "Unfollow"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
