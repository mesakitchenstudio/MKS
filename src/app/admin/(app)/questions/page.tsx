import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { adminFocusRing } from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";
import { isRecipeQaEnabled } from "@/lib/flags";
import { requireAccess } from "@/lib/auth";
import {
  parseRecipeQuestionAdminFilter,
  type RecipeQuestionAdminFilter,
  type RecipeQuestionStatus,
} from "@/lib/recipe-questions";
import { listRecipeQuestionsForAdmin } from "@/lib/recipe-questions-server";
import { notFound } from "next/navigation";

export const metadata = { title: "Questions" };
export const dynamic = "force-dynamic";

const FILTERS: { value: RecipeQuestionAdminFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

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

function excerpt(body: string, max = 160) {
  const text = body.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isRecipeQaEnabled()) notFound();
  await requireAccess("content");

  const { status: statusParam } = await searchParams;
  const filter = parseRecipeQuestionAdminFilter(statusParam);
  const statusFilter: RecipeQuestionStatus | undefined =
    filter === "all" ? undefined : filter;

  const questions = await listRecipeQuestionsForAdmin({
    status: statusFilter,
    limit: 100,
  });

  return (
    <div>
      <AdminPageHeader
        title="Recipe Questions"
        description="Moderate member cooking questions and publish official Mesa answers."
      />

      <nav
        className="mt-5 flex flex-wrap gap-2"
        aria-label="Question status filters"
      >
        {FILTERS.map((item) => {
          const active = item.value === filter;
          const href =
            item.value === "pending"
              ? "/admin/questions"
              : `/admin/questions?status=${item.value}`;
          return (
            <Link
              key={item.value}
              href={href}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${adminFocusRing} ${
                active
                  ? "bg-terracotta text-paper"
                  : "border border-line bg-paper text-ink hover:bg-cream"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {questions.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          {filter === "pending"
            ? "No pending questions."
            : "No questions in this filter."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line/70 border-t border-line/70">
          {questions.map((q) => (
            <li key={q.id} className="min-w-0 py-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {statusLabel(q.status)}
                    {q.hasAnswer ? " · Answered" : " · No answer"}
                  </p>
                  <p className="mt-1 break-words font-semibold text-ink">
                    {q.recipeTitle}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
                    {excerpt(q.body)}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {q.authorName}
                    {q.memberEmail ? ` · ${q.memberEmail}` : ""}
                    {" · "}
                    {formatAdminDate(q.createdAt)}
                  </p>
                </div>
                <Link
                  href={`/admin/questions/${q.id}`}
                  className={`shrink-0 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${adminFocusRing}`}
                >
                  Open question
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
