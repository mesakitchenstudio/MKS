import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restoreRecipeRevisionAction } from "@/app/admin/actions";
import { RecipeEditorSubnav } from "@/components/admin/RecipeEditorSubnav";
import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminWorkspaceWide,
} from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTimeUtc } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import {
  buildRecipeRevisionSnapshot,
  humanizeRecipeRevisionReason,
  parseRecipeRevisionSnapshot,
} from "@/lib/recipe-revisions";
import { summarizeRecipeAuditChanges } from "@/lib/admin-audit";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getDb().recipe.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!recipe) return { title: "Revision" };
  return { title: `${recipe.title} · Revision` };
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
    publicUpdateNote: "Public update note",
  };
  return map[field] || field;
}

export default async function RecipeRevisionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; revisionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAccess("content");
  const { id, revisionId } = await params;
  const query = await searchParams;

  const db = getDb();
  const [recipe, revision] = await Promise.all([
    db.recipe.findUnique({
      where: { id },
      include: { categories: { select: { categoryId: true } } },
    }),
    db.recipeRevision.findUnique({ where: { id: revisionId } }),
  ]);

  if (!recipe || !revision || revision.stableRecipeId !== id) notFound();

  const snapshot = parseRecipeRevisionSnapshot(revision.snapshot);
  if (!snapshot) notFound();

  const current = buildRecipeRevisionSnapshot({
    title: recipe.title,
    excerpt: recipe.excerpt,
    featured: recipe.featured,
    seasonal: recipe.seasonal,
    typeId: recipe.typeId,
    categoryIds: recipe.categories.map((c) => c.categoryId),
    values: recipe.values,
    slug: recipe.slug,
    status: recipe.status,
    publishedAt: recipe.publishedAt,
    publicUpdateNote: recipe.publicUpdateNote,
    publicUpdatedAt: recipe.publicUpdatedAt,
  });

  const vsCurrent = summarizeRecipeAuditChanges({
    before: {
      title: snapshot.title,
      slug: snapshot.slug,
      excerpt: snapshot.excerpt,
      status: snapshot.status,
      featured: snapshot.featured,
      seasonal: snapshot.seasonal,
      typeId: snapshot.typeId,
      categoryIds: snapshot.categoryIds,
      values: snapshot.values,
      publicUpdateNote: snapshot.publicUpdateNote,
      publicUpdatedAt: snapshot.publicUpdatedAt,
    },
    after: {
      title: current.title,
      slug: current.slug,
      excerpt: current.excerpt,
      status: current.status,
      featured: current.featured,
      seasonal: current.seasonal,
      typeId: current.typeId,
      categoryIds: current.categoryIds,
      values: current.values,
      publicUpdateNote: current.publicUpdateNote,
      publicUpdatedAt: current.publicUpdatedAt,
    },
  }).filter((field) => field !== "slug" && field !== "status");

  let changedFields: string[] = [];
  try {
    const parsed = JSON.parse(revision.changedFields || "[]") as unknown;
    if (Array.isArray(parsed)) changedFields = parsed.map(String);
  } catch {
    changedFields = [];
  }

  const isBaseline = revision.reason === "baseline";

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <header className="mb-6">
        <Link
          href={`/admin/recipes/${id}/history`}
          className="text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          ← History
        </Link>
        <h1 className="mt-2 font-serif text-3xl text-ink">{recipe.title}</h1>
        <div className="mt-4">
          <RecipeEditorSubnav recipeId={id} active="history" />
        </div>
      </header>

      {query.error ? (
        <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
          That revision could not be restored.
        </p>
      ) : null}

      <section className="mb-8 max-w-2xl">
        <p className="text-sm text-ink">
          <span className="font-semibold">
            {isBaseline ? "System" : revision.actorName || "Staff"}
          </span>
          <span className="text-muted"> · </span>
          {humanizeRecipeRevisionReason(revision.reason)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {formatAdminDateTimeUtc(revision.createdAt)} GMT
        </p>
        {revision.note ? <p className="mt-2 text-sm text-muted">{revision.note}</p> : null}
        {changedFields.length ? (
          <p className="mt-3 text-sm text-muted">
            Recorded changes:{" "}
            {changedFields
              .filter((field) => field !== "slug" && field !== "status")
              .map(fieldLabel)
              .join(" · ") || "—"}
          </p>
        ) : null}
      </section>

      <section className="mb-8 max-w-2xl rounded-sm border border-line bg-cream/30 p-4">
        <h2 className="text-sm font-semibold text-ink">Historical context</h2>
        <dl className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-ink">Slug at this version</dt>
            <dd className="font-mono text-xs">{snapshot.slug || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Status at this version</dt>
            <dd>{snapshot.status || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Current slug (unchanged by restore)</dt>
            <dd className="font-mono text-xs">{recipe.slug}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Current status (unchanged by restore)</dt>
            <dd>{recipe.status}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm leading-6 text-muted">
          Restore updates recipe content only. Public URL and publication state stay as they are
          now. Change those with the normal editor controls if needed.
        </p>
      </section>

      <section className="mb-8 max-w-2xl">
        <h2 className="text-sm font-semibold text-ink">Compared with current recipe</h2>
        {vsCurrent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Content matches the current recipe.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {vsCurrent.map((field) => (
              <li key={field}>{fieldLabel(field)}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <form action={restoreRecipeRevisionAction}>
          <input type="hidden" name="recipeId" value={id} />
          <input type="hidden" name="revisionId" value={revisionId} />
          <button
            type="submit"
            className={adminPrimaryButtonClass}
            disabled={vsCurrent.length === 0}
          >
            Restore content
          </button>
        </form>
        <Link href={`/admin/recipes/${id}`} className={adminSecondaryButtonClass}>
          Back to editor
        </Link>
      </div>
    </div>
  );
}
