import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminQuestionModerationForm } from "@/components/admin/AdminQuestionModerationForm";
import { adminFocusRing } from "@/lib/admin-ui";
import { formatAdminDate, formatAdminDateTime } from "@/lib/datetime";
import { isRecipeQaEnabled } from "@/lib/flags";
import { requireAccess } from "@/lib/auth";
import {
  adminRecipeQuestionHref,
  type RecipeQuestionStatus,
} from "@/lib/recipe-questions";
import { getRecipeQuestionForAdmin } from "@/lib/recipe-questions-server";

export const dynamic = "force-dynamic";

function statusLabel(status: RecipeQuestionStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "published":
      return "Published";
    case "hidden":
      return "Hidden";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

export default async function AdminQuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isRecipeQaEnabled()) notFound();
  await requireAccess("content");

  const { id } = await params;
  const question = await getRecipeQuestionForAdmin(id);
  if (!question) notFound();

  const recipeLink = adminRecipeQuestionHref({
    recipeId: question.recipeId,
    recipeSlug: question.recipeSlug,
    recipeStatus: question.recipeStatus,
  });
  const recipeDraft = question.recipeStatus !== "published";

  return (
    <div>
      <Link
        href="/admin/questions"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Questions
      </Link>

      <article className="mt-5">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="min-w-0 break-words font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            {question.recipeTitle}
          </h1>
          <p className="shrink-0 text-sm font-semibold text-muted">
            {statusLabel(question.status)}
          </p>
        </div>

        <p className="mt-2">
          <Link
            href={recipeLink.href}
            target={recipeLink.external ? "_blank" : undefined}
            rel={recipeLink.external ? "noreferrer" : undefined}
            className={`text-sm font-semibold text-muted hover:text-terracotta ${adminFocusRing}`}
          >
            {recipeDraft ? "Open recipe in Admin" : "View public recipe"}
            {recipeLink.external ? <span aria-hidden> ↗</span> : null}
            {recipeLink.external ? (
              <span className="sr-only"> (opens in a new tab)</span>
            ) : null}
          </Link>
        </p>

        <section className="mt-6 min-w-0" aria-labelledby="member-question-heading">
          <h2 id="member-question-heading" className="font-serif text-xl text-ink">
            Member question
          </h2>
          <p className="mt-2 text-sm text-ink">
            <span className="font-semibold">{question.authorName}</span>
            <span className="text-muted">
              {" · "}
              {formatAdminDate(question.createdAt)}
            </span>
          </p>
          {question.memberEmail ? (
            <p className="mt-0.5 break-all text-xs text-muted/75">
              {question.memberEmail}
            </p>
          ) : null}
          <p className="mt-4 max-w-3xl whitespace-pre-wrap break-words text-[1.05rem] leading-[1.75] text-ink/90">
            {question.body}
          </p>
          {question.answeredAt ? (
            <p className="mt-3 text-xs text-muted">
              First answered {formatAdminDateTime(question.answeredAt)}
              {question.publishedAt
                ? ` · First published ${formatAdminDateTime(question.publishedAt)}`
                : ""}
            </p>
          ) : null}
        </section>

        <AdminQuestionModerationForm
          question={question}
          recipeDraft={recipeDraft}
        />
      </article>
    </div>
  );
}
