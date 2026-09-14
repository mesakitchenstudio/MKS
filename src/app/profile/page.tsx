import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { getStaffByEmail, getUserByEmail, removeMemberByEmail } from "@/lib/accounts";
import { homeForRole } from "@/lib/admin-access";
import { formatLongDate } from "@/lib/datetime";
import { getAllRecipes } from "@/lib/recipes";
import { authFocusRing } from "@/lib/auth-ui";
import { memberIdentityLines, resolveMemberDisplayName } from "@/lib/auth-client";
import { EmailUpdatesPreference } from "@/components/EmailUpdatesPreference";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { ProfileFavorites } from "@/components/ProfileFavorites";
import { ProfileSavedCollections } from "@/components/ProfileSavedCollections";
import { isMemberNewsletterSubscribed } from "@/lib/member-newsletter";
import { getMemberSavedCollections } from "@/lib/saved-recipe-collections-server";
import { isMealPlannerEnabled } from "@/lib/meal-planner";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || session?.error === "MemberDeleted" || session?.error === "SessionRevoked") {
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

  const [user, recipes, newsletterSubscribed] = await Promise.all([
    getUserByEmail(email),
    getAllRecipes(),
    isMemberNewsletterSubscribed(email),
  ]);
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
  const collections = await getMemberSavedCollections(user.id, recipes);

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
            <h1 className="break-words font-serif text-4xl leading-[1.15] text-ink md:text-5xl">
              {name}
            </h1>
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

      {isMealPlannerEnabled() ? (
        <section className="mt-7 border-t border-line pt-7 md:mt-8 md:pt-8">
          <h2 className="font-serif text-3xl text-ink">Meal Planner</h2>
          <p className="mt-1.5 text-sm text-muted">
            Plan recipes across your week. Private to your account.
          </p>
          <Link
            href="/profile/meal-planner"
            className={`mt-4 inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 ${authFocusRing}`}
          >
            Open Meal Planner
          </Link>
        </section>
      ) : null}

      <section className="mt-7 border-t border-line pt-7 md:mt-8 md:pt-8">
        <h2 className="font-serif text-3xl text-ink">Saved recipes</h2>
        <p className="mt-1.5 text-sm text-muted">
          All Saved is everything you&apos;ve hearted. Collections are optional folders on top.
        </p>
        <div className="mt-6 space-y-8 lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:space-y-0">
          <ProfileSavedCollections
            collections={collections}
            allSavedCount={savedRecipes.length}
          />
          <div className="min-w-0 border-t border-line pt-8 lg:border-t-0 lg:pt-0">
            <h3 className="font-serif text-2xl text-ink">All Saved</h3>
            <ProfileFavorites recipes={savedRecipes} extras={missing} />
          </div>
        </div>
      </section>

      <EmailUpdatesPreference initialNotify={newsletterSubscribed} />

      <DeleteAccountSection />
    </div>
  );
}
