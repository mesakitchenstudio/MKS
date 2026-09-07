import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeEditorSubnav } from "@/components/admin/RecipeEditorSubnav";
import { adminSecondaryButtonClass, adminWorkspaceWide } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminShortDateTime } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import {
  humanizeRecipeRevisionReason,
  listRecipeRevisions,
} from "@/lib/recipe-revisions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getDb().recipe.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!recipe) return { title: "History" };
  return { title: `${recipe.title} · History` };
}

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dayHeading(date: Date, now = new Date()) {
  const key = dayKey(date);
  const today = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (key === today) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function timeLabel(date: Date) {
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function fieldLabel(field: string) {
  const map: Record<string, string> = {
    title: "Title",
    excerpt: "Description",
    featured: "Featured",
    seasonal: "Seasonal",
    recipeType: "Recipe type",
    categories: "Categories",
    heroImage: "Hero image",
    ingredients: "Ingredients",
    instructions: "Instructions",
    timesYield: "Times / yield",
    learn: "Learn / tips",
    youtube: "YouTube",
    nutrition: "Nutrition",
    created: "Created",
    baseline: "Baseline",
  };
  return map[field] || field;
}

export default async function RecipeHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("content");
  const { id } = await params;
  const recipe = await getDb().recipe.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, status: true },
  });
  if (!recipe) notFound();

  const revisions = await listRecipeRevisions(id, { take: 150 });
  const groups: { key: string; label: string; items: typeof revisions }[] = [];
  for (const revision of revisions) {
    const key = dayKey(revision.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(revision);
    else groups.push({ key, label: dayHeading(revision.createdAt), items: [revision] });
  }

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <header className="mb-6">
        <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink">
          ← Recipes
        </Link>
        <h1 className="mt-2 font-serif text-3xl text-ink">{recipe.title}</h1>
        <div className="mt-4">
          <RecipeEditorSubnav recipeId={recipe.id} active="history" />
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          Meaningful saved versions of this recipe. Restoring a version brings back content
          (ingredients, instructions, and related fields) but keeps the current public URL and
          publication status. Times in GMT.
        </p>
      </header>

      {revisions.length === 0 ? (
        <p className="text-sm text-muted">
          No revisions yet. Save this recipe to create the first version, or run the baseline
          backfill for existing recipes.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {group.label}
              </h2>
              <ul className="divide-y divide-line/70 border-y border-line/70">
                {group.items.map((revision) => {
                  const fields = revision.changedFields
                    .filter((field) => field !== "slug" && field !== "status")
                    .map(fieldLabel);
                  const isBaseline = revision.reason === "baseline";
                  return (
                    <li
                      key={revision.id}
                      className="grid gap-3 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-5"
                    >
                      <time
                        className="font-mono text-xs text-muted"
                        dateTime={revision.createdAt.toISOString()}
                        title={formatAdminShortDateTime(revision.createdAt)}
                      >
                        {timeLabel(revision.createdAt)}
                      </time>
                      <div className="min-w-0">
                        <p className="text-sm text-ink">
                          <span className="font-semibold">
                            {isBaseline ? "System" : revision.actorName || "Staff"}
                          </span>
                          <span className="text-muted"> · </span>
                          <span>{humanizeRecipeRevisionReason(revision.reason)}</span>
                        </p>
                        {fields.length ? (
                          <p className="mt-1 text-sm text-muted">{fields.join(" · ")}</p>
                        ) : null}
                        {revision.note ? (
                          <p className="mt-1 text-sm text-muted">{revision.note}</p>
                        ) : null}
                      </div>
                      <Link
                        href={`/admin/recipes/${recipe.id}/history/${revision.id}`}
                        className={`${adminSecondaryButtonClass} justify-self-start sm:justify-self-end`}
                      >
                        {isBaseline ? "View" : "View changes"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
