import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getStaffByEmail, getUserByEmail, removeMemberByEmail } from "@/lib/accounts";
import { homeForRole } from "@/lib/admin-access";
import { ProfileCollectionView } from "@/components/ProfileCollectionView";
import { getAllRecipes } from "@/lib/recipes";
import { authFocusRing } from "@/lib/auth-ui";
import {
  getMemberSavedCollection,
} from "@/lib/saved-recipe-collections-server";

export const metadata: Metadata = {
  title: "Collection",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfileCollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const session = await auth();
  const email = session?.user?.email;
  const { collectionId } = await params;

  if (!email || session?.error === "MemberDeleted" || session?.error === "SessionRevoked") {
    redirect("/profile");
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
  if (!user) redirect("/profile");

  const detail = await getMemberSavedCollection(user.id, collectionId, recipes);
  if (!detail) notFound();

  const publishedSlugs = new Set(recipes.map((recipe) => recipe.slug));
  const memberIdsInCollection = new Set(detail.memberships.map((row) => row.recipeSaveId));
  const addableSaves = (user.saves ?? [])
    .filter((save) => {
      if (memberIdsInCollection.has(save.id)) return false;
      return publishedSlugs.has(save.slug);
    })
    .map((save) => {
      const live = recipes.find((recipe) => recipe.slug === save.slug);
      return {
        recipeSaveId: save.id,
        slug: live?.slug || save.slug,
        title: live?.title || save.title,
      };
    });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
      <ProfileCollectionView
        collectionId={detail.id}
        collectionName={detail.name}
        recipes={detail.recipes}
        memberships={detail.memberships}
        addableSaves={addableSaves}
      />
    </div>
  );
}
