import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { ensureMember, getStaffByEmail, getUserByEmail, removeMemberByEmail } from "@/lib/accounts";
import { homeForRole } from "@/lib/admin-access";
import { formatGmtDisplay } from "@/lib/datetime";
import { getAllRecipes } from "@/lib/recipes";
import { ProfileFavorites } from "@/components/ProfileFavorites";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Account</p>
        <h1 className="mt-2 font-serif text-5xl">Your profile</h1>
        <p className="mt-4 text-muted">
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
        <h1 className="mt-2 font-serif text-5xl">{staff.name}</h1>
        <p className="mt-4 text-muted">
          This email is a studio admin, not a public member account.
        </p>
        <Link href={homeForRole(staff.role)} className="mt-6 inline-block font-semibold text-terracotta">
          Open studio admin
        </Link>
      </div>
    );
  }

  await ensureMember(email, session.user?.name ?? "", await headers());
  const [user, recipes] = await Promise.all([getUserByEmail(email), getAllRecipes()]);
  const name = user?.name || session.user?.name || email;
  const saves = user?.saves ?? [];
  const savedRecipes = saves
    .map((save) => recipes.find((recipe) => recipe.slug === save.slug))
    .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe));
  const missing = saves.filter((save) => !recipes.some((recipe) => recipe.slug === save.slug));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Account</p>
      <h1 className="mt-2 font-serif text-5xl">{name}</h1>
      <p className="mt-2 text-muted">{email}</p>
      {user?.createdAt ? (
        <p className="mt-1 text-sm text-muted">
          Member since {formatGmtDisplay(user.createdAt)}
        </p>
      ) : null}

      <section className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-3xl">Favorite recipes</h2>
            <p className="mt-1 text-sm text-muted">
              Everything you have hearted is saved to this profile.
            </p>
          </div>
          <p className="text-sm text-muted">
            {saves.length} {saves.length === 1 ? "save" : "saves"}
          </p>
        </div>

        {savedRecipes.length || missing.length ? (
          <ProfileFavorites recipes={savedRecipes} extras={missing} />
        ) : (
          <p className="mt-8 border border-line bg-paper px-5 py-8 text-sm text-muted">
            Open a recipe and tap the heart to save it here.
          </p>
        )}
      </section>
    </div>
  );
}
