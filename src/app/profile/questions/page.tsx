import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProfileQuestionsView } from "@/components/ProfileQuestionsView";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isRecipeQaEnabled } from "@/lib/flags";
import { listRecipeQuestionsForUser } from "@/lib/recipe-questions-server";
import type { ProfileRecipeQuestionItem } from "@/lib/recipe-questions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!isRecipeQaEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: "My Questions",
    robots: { index: false, follow: false },
  };
}

function toClientItem(item: ProfileRecipeQuestionItem) {
  return {
    id: item.id,
    recipeId: item.recipeId,
    recipeSlug: item.recipeSlug,
    recipeTitle: item.recipeTitle,
    recipeStatus: item.recipeStatus,
    body: item.body,
    status: item.status,
    answerBody: item.answerBody,
    answeredAt: item.answeredAt ? item.answeredAt.toISOString() : null,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    canEdit: item.canEdit,
    canDelete: item.canDelete,
  };
}

export default async function ProfileQuestionsPage() {
  if (!isRecipeQaEnabled()) notFound();

  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session?.error === "MemberDeleted" ||
    session?.error === "SessionRevoked"
  ) {
    redirect("/profile");
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) redirect("/profile");

  let items: ReturnType<typeof toClientItem>[] | null = null;
  let listFailed = false;
  try {
    const rows = await listRecipeQuestionsForUser({ userId: member.id });
    items = rows.map(toClientItem);
  } catch {
    listFailed = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-12">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Profile
      </p>
      <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">My Questions</h1>
      <p className="mt-3 max-w-xl text-muted">
        Questions you&apos;ve asked on recipes, and official Mesa answers when published.
      </p>
      {listFailed || items == null ? (
        <p className="mt-10 max-w-xl text-lg text-ink/90" role="alert">
          Questions are temporarily unavailable.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-10 max-w-xl">
          <p className="text-lg text-ink/90">
            You haven&apos;t asked any recipe questions yet.
          </p>
          <Link
            href="/recipes"
            className="mt-6 inline-flex text-sm font-semibold text-terracotta hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta rounded-sm"
          >
            Browse recipes
          </Link>
        </div>
      ) : (
        <ProfileQuestionsView initial={items} />
      )}
    </div>
  );
}
