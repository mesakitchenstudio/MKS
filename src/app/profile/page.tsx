import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { getStaffByEmail, getUserByEmail, removeMemberByEmail } from "@/lib/accounts";
import { homeForRole } from "@/lib/admin-access";
import { formatLongDate } from "@/lib/datetime";
import { getAllRecipes, type PublicRecipe } from "@/lib/recipes";
import { authFocusRing } from "@/lib/auth-ui";
import { memberIdentityLines, resolveMemberDisplayName } from "@/lib/auth-client";
import { EmailUpdatesPreference } from "@/components/EmailUpdatesPreference";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { ProfileFavorites } from "@/components/ProfileFavorites";
import { ProfileSavedCollections } from "@/components/ProfileSavedCollections";
import { MemberHomeThisWeek } from "@/components/member-home/MemberHomeThisWeek";
import { MemberHomeRecentlyViewed } from "@/components/member-home/MemberHomeRecentlyViewed";
import {
  MemberHomeCollectionsSection,
  MemberHomeDiscoverSection,
  MemberHomeGetStarted,
  MemberHomeRecommendationsSection,
} from "@/components/member-home/MemberHomeSections";
import { MemberHomeTextLink } from "@/components/member-home/RecommendationRecipeCard";
import { isMemberNewsletterSubscribed } from "@/lib/member-newsletter";
import { getMemberSavedCollections } from "@/lib/saved-recipe-collections-server";
import { isMealPlannerEnabled } from "@/lib/meal-planner";
import {
  isMemberHomeColdStart,
  isPersonalizedMemberHomeEnabled,
  memberHomeWelcomeHeading,
} from "@/lib/member-home";
import { getPersonalizedMemberHomeForUser } from "@/lib/member-home-server";
import type { MemberCollectionSummary } from "@/lib/saved-recipe-collections";
import type { Recipe } from "@/data/types";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || session?.error === "MemberDeleted" || session?.error === "SessionRevoked") {
    return <SignedOutProfile />;
  }

  const staff = await getStaffByEmail(email);
  if (staff) {
    await removeMemberByEmail(email);
    return <StaffProfileNotice name={staff.name} role={staff.role} />;
  }

  const [user, recipes, newsletterSubscribed] = await Promise.all([
    getUserByEmail(email),
    getAllRecipes(),
    isMemberNewsletterSubscribed(email),
  ]);
  if (!user) {
    return <SignedOutProfile />;
  }

  const identity = memberIdentityLines({
    name: user.name || session.user?.name,
    email,
  });
  const name = resolveMemberDisplayName({
    name: user.name || session.user?.name,
    email,
  });
  const photoUrl = (user.photoUrl || session.user?.image || "").trim();
  const mealPlannerEnabled = isMealPlannerEnabled();

  if (!isPersonalizedMemberHomeEnabled()) {
    return (
      <BaselineProfile
        email={email}
        name={name}
        identity={identity}
        photoUrl={photoUrl}
        createdAt={user.createdAt}
        recipes={recipes}
        saves={user.saves ?? []}
        userId={user.id}
        newsletterSubscribed={newsletterSubscribed}
      />
    );
  }

  const home = await getPersonalizedMemberHomeForUser(user.id, {
    publishedRecipes: recipes,
  });
  const recipesBySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));
  const coldStart = isMemberHomeColdStart(home);
  const hasRecommendations =
    home.recommendations.status === "ok" && home.recommendations.items.length > 0;
  const showDiscover =
    coldStart ||
    !hasRecommendations ||
    home.recommendations.status === "unavailable" ||
    home.recommendations.status === "empty";
  const discoverRecipes = showDiscover
    ? home.discover.recipes
        .map((card) => recipesBySlug.get(card.slug))
        .filter((recipe): recipe is PublicRecipe => Boolean(recipe))
    : [];
  const savedPreviewRecipes = home.saved.recipes
    .map((card) => recipesBySlug.get(card.slug))
    .filter((recipe): recipe is PublicRecipe => Boolean(recipe));
  const welcome = memberHomeWelcomeHeading({
    name: user.name || session.user?.name,
    email,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
      <header>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Your Mesa
        </p>
        <div className="mt-3 flex items-start gap-3.5 sm:gap-4">
          {photoUrl ? (
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-line bg-sand sm:h-16 sm:w-16">
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
              {welcome}
            </h1>
            {identity.secondary ? (
              <p className="mt-1.5 break-words text-muted">{identity.secondary}</p>
            ) : identity.primary && welcome === "Your Mesa" ? (
              <p className="mt-1.5 break-words text-muted">{identity.primary}</p>
            ) : null}
            {user.createdAt ? (
              <p className="mt-1 text-sm text-muted">
                Member since {formatLongDate(user.createdAt)}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {!coldStart && mealPlannerEnabled ? (
        <MemberHomeThisWeek initialPlanner={home.planner} />
      ) : null}

      <MemberHomeRecentlyViewed recipes={recipes} />

      {hasRecommendations ? (
        <MemberHomeRecommendationsSection
          items={home.recommendations.items}
          recipesBySlug={recipesBySlug}
        />
      ) : null}

      {!coldStart && home.saved.status === "unavailable" ? (
        <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-saved">
          <h2 id="member-home-saved" className="font-serif text-3xl text-ink">
            Your Saved Recipes
          </h2>
          <p className="mt-1.5 text-sm text-muted" role="status">
            Saved recipes could not be loaded.{" "}
            <MemberHomeTextLink href="/recipes">Browse recipes</MemberHomeTextLink>
          </p>
        </section>
      ) : null}

      {!coldStart && home.saved.visibleSaveCount > 0 ? (
        <section
          id="saved-recipes"
          className="mt-8 border-t border-line pt-8"
          aria-labelledby="member-home-saved"
        >
          <h2 id="member-home-saved" className="font-serif text-3xl text-ink">
            Your Saved Recipes
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {home.saved.visibleSaveCount > savedPreviewRecipes.length
              ? `Showing ${savedPreviewRecipes.length} of ${home.saved.visibleSaveCount} saved recipes.`
              : "Recipes you have hearted — organize them into collections anytime."}
          </p>
          <ProfileFavorites recipes={savedPreviewRecipes} extras={[]} />
        </section>
      ) : null}

      {!coldStart ? (
        <MemberHomeCollectionsSection
          collections={home.collections.collections}
          totalCollectionCount={home.collections.totalCollectionCount}
          hasVisibleSaves={home.saved.visibleSaveCount > 0}
          status={home.collections.status}
        />
      ) : null}

      {showDiscover ? (
        <MemberHomeDiscoverSection recipes={discoverRecipes} showGetStartedHint={coldStart} />
      ) : null}

      {coldStart ? <MemberHomeGetStarted mealPlannerEnabled={mealPlannerEnabled} /> : null}

      <EmailUpdatesPreference initialNotify={newsletterSubscribed} />
      <DeleteAccountSection />
    </div>
  );
}

function SignedOutProfile() {
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

function StaffProfileNotice({
  name,
  role,
}: {
  name: string;
  role: Parameters<typeof homeForRole>[0];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Studio</p>
      <h1 className="mt-3 font-serif text-4xl md:text-5xl">{name}</h1>
      <p className="mt-4 text-muted">
        This email is a studio admin, not a public member account.
      </p>
      <Link
        href={homeForRole(role)}
        className={`mt-6 inline-block rounded-sm font-semibold text-terracotta ${authFocusRing}`}
      >
        Open studio admin
      </Link>
    </div>
  );
}

/** Gate OFF — current Production Profile experience (unchanged structure). */
async function BaselineProfile({
  email,
  name,
  identity,
  photoUrl,
  createdAt,
  recipes,
  saves,
  userId,
  newsletterSubscribed,
}: {
  email: string;
  name: string;
  identity: { primary: string; secondary: string | null };
  photoUrl: string;
  createdAt: Date | string | null | undefined;
  recipes: PublicRecipe[];
  saves: { slug: string; title?: string; id?: string }[];
  userId: string;
  newsletterSubscribed: boolean;
}) {
  void email;
  const savedRecipes = saves
    .map((save) => recipes.find((recipe) => recipe.slug === save.slug))
    .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe));
  const missing = saves.filter((save) => !recipes.some((recipe) => recipe.slug === save.slug));
  const collections: MemberCollectionSummary[] = await getMemberSavedCollections(userId, recipes);

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
            {createdAt ? (
              <p className={`${identity.secondary ? "mt-1" : "mt-1.5"} text-sm text-muted`}>
                Member since {formatLongDate(createdAt)}
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
            <ProfileFavorites recipes={savedRecipes as Recipe[]} extras={missing as { slug: string; title: string; id?: string }[]} />
          </div>
        </div>
      </section>

      <EmailUpdatesPreference initialNotify={newsletterSubscribed} />

      <DeleteAccountSection />
    </div>
  );
}
