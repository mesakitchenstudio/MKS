import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { getStaffByEmail, getUserByEmail, removeMemberByEmail } from "@/lib/accounts";
import { homeForRole } from "@/lib/admin-access";
import { formatLongDate } from "@/lib/datetime";
import { getAllRecipes } from "@/lib/recipes";
import { authFocusRing } from "@/lib/auth-ui";
import { memberIdentityLines, resolveMemberDisplayName } from "@/lib/auth-client";
import { FavoritesEmptyState, ProfileFavorites } from "@/components/ProfileFavorites";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || session?.error === "MemberDeleted") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Account</p>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl">Your profile</h1>
        <p className="mt-4 max-w-md text-muted">
          Use Sign in in the top-right corner to see the recipes you have saved.
        </p>
      </div>
    );
  }

  const staff = await getStaffByEmail(email);
  if (staff) {
    await removeMemberByEmail(email);
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Studio</p>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl">{staff.name}</h1>
        <p className="mt-4 text-muted">
          This email is a studio admin, not a public member account.
        </p>
        <Link
          href={homeForRole(staff.role)}
          className={`mt-6 inline-block rounded-sm font-semibold text-terracotta ${authFocusRing}`}
        >
          Open studio admin
        </Link>
      </div>
    );
  }

  const [user, recipes] = await Promise.all([getUserByEmail(email), getAllRecipes()]);
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Account</p>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl">Your profile</h1>
        <p className="mt-4 max-w-md text-muted">
          Use Sign in in the top-right corner to see the recipes you have saved.
        </p>
      </div>
    );
  }

  const identity = memberIdentityLines({
    name: user.name || session.user?.name,
    email,
  });
  const name = resolveMemberDisplayName({
    name: user.name || session.user?.name,
    email,
  });
  const saves = user.saves ?? [];
  const savedRecipes = saves
    .map((save) => recipes.find((recipe) => recipe.slug === save.slug))
    .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe));
  const missing = saves.filter((save) => !recipes.some((recipe) => recipe.slug === save.slug));
  const photoUrl = (user.photoUrl || session.user?.image || "").trim();
  const savedCount = saves.length;
  const savedLabel =
    savedCount === 1 ? "1 saved recipe" : `${savedCount} saved recipes`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
      <header>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Account
        </p>

        <div className="mt-3 flex items-start gap-3.5 sm:gap-4">
          {photoUrl ? (
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-line bg-sand sm:h-16 sm:w-16">
              {/* Google / remote member photos — same pattern as admin MemberAvatar */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-4xl leading-[1.15] text-ink md:text-5xl">{name}</h1>
            {identity.secondary ? (
              <p className="mt-1.5 break-words text-muted">{identity.secondary}</p>
            ) : null}
            {user.createdAt ? (
              <p className={`${identity.secondary ? "mt-1" : "mt-1.5"} text-sm text-muted`}>
                Member since {formatLongDate(user.createdAt)}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mt-7 border-t border-line pt-7 md:mt-8 md:pt-8">
        <h2 className="font-serif text-3xl text-ink">Favorite recipes</h2>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm text-muted">Recipes you save are collected here.</p>
          {savedCount > 0 ? (
            <p className="text-sm text-muted">{savedLabel}</p>
          ) : null}
        </div>

        {savedRecipes.length || missing.length ? (
          <ProfileFavorites recipes={savedRecipes} extras={missing} />
        ) : (
          <FavoritesEmptyState />
        )}
      </section>
    </div>
  );
}
