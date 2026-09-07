import type { Metadata } from "next";
import Link from "next/link";
import { requireAccess } from "@/lib/auth";
import { loadRecipeContentHealthCatalogue } from "@/lib/recipe-content-health-server";
import {
  contentHealthStatusLabel,
  topContentHealthIssues,
  type RecipeContentHealth,
  type RecipeContentHealthFilter,
} from "@/lib/recipe-content-health";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
  adminTableHeadClass,
} from "@/lib/admin-ui";

export const metadata: Metadata = {
  title: "Content Health",
};

export const dynamic = "force-dynamic";

function parseFilters(params: Record<string, string | string[] | undefined>): RecipeContentHealthFilter {
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const publication = raw("status");
  const health = raw("health");
  return {
    publication:
      publication === "published" || publication === "draft" ? publication : "all",
    health:
      health === "needs_attention" ||
      health === "recommendations" ||
      health === "healthy" ||
      health === "draft_ready" ||
      health === "draft_not_ready"
        ? health
        : "all",
    typeId: String(raw("type") || "").trim() || undefined,
    query: String(raw("q") || "").trim() || undefined,
  };
}

function healthBadgeClass(health: RecipeContentHealth["health"]) {
  switch (health) {
    case "needs_attention":
      return "text-terracotta";
    case "recommendations":
    case "draft_recommendations":
      return "text-olive";
    case "draft_not_ready":
      return "text-muted";
    default:
      return "text-ink";
  }
}

function buildFilterHref(next: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value && value !== "all") params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/admin/content-health?${qs}` : "/admin/content-health";
}

function RecipeHealthRow({ row }: { row: RecipeContentHealth }) {
  const issues = topContentHealthIssues(row, 3);
  const more = row.issues.length - issues.length;
  return (
    <li className="border border-line bg-paper px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-xl text-ink">{row.title}</p>
          <p className="mt-1 text-sm text-muted">
            {row.publicationStatus === "published" ? "Published" : "Draft"}
            {row.typeName ? ` · ${row.typeName}` : null}
            {row.issues.length
              ? ` · ${row.issues.length} ${row.issues.length === 1 ? "issue" : "issues"}`
              : null}
          </p>
          <p className={`mt-2 text-sm font-semibold ${healthBadgeClass(row.health)}`}>
            {contentHealthStatusLabel(row.health)}
          </p>
          {issues.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <span className="text-ink">{issue.title}</span>
                  {issue.description ? ` — ${issue.description}` : null}
                </li>
              ))}
              {more > 0 ? <li>+{more} more</li> : null}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No open issues.</p>
          )}
        </div>
        <Link
          href={`/admin/recipes/${row.recipeId}`}
          className={`${adminPrimaryButtonClass} ${adminFocusRing} shrink-0`}
        >
          Review recipe
        </Link>
      </div>
    </li>
  );
}

export default async function AdminContentHealthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess("content");
  const params = await searchParams;
  const filters = parseFilters(params);
  const { filtered, summary, types, rows } = await loadRecipeContentHealthCatalogue(filters);

  const needsAttention = filtered.filter((row) => row.health === "needs_attention");
  const recommendations = filtered.filter((row) => row.health === "recommendations");
  const draftReady = filtered.filter(
    (row) => row.health === "draft_ready" || row.health === "draft_recommendations",
  );
  const draftNotReady = filtered.filter((row) => row.health === "draft_not_ready");
  const healthy = filtered.filter((row) => row.health === "healthy");

  const currentStatus = filters.publication ?? "all";
  const currentHealth = filters.health ?? "all";
  const currentType = filters.typeId ?? "";
  const currentQuery = filters.query ?? "";

  if (summary.totalCount === 0) {
    return (
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="font-serif text-3xl text-ink">Content Health</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Deterministic publishing readiness across Recipes — not a score, SEO grade, or traffic
            report.
          </p>
        </div>
        <p className="text-sm text-muted">No recipes yet.</p>
        <p>
          <Link href="/admin/recipes/new" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Create recipe
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-ink">Content Health</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Which Recipes need attention, which drafts are ready, and what to fix — powered by
          Publishing Readiness.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Published
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{summary.publishedCount}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Needs attention
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{summary.needsAttentionCount}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Recommendations
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{summary.recommendationsCount}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Drafts ready
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{summary.draftsReadyCount}</p>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get" action="/admin/content-health">
        <label className="min-w-[10rem] text-sm">
          <span className="mb-1 block text-muted">Status</span>
          <select name="status" defaultValue={currentStatus} className={adminSelectClass}>
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <label className="min-w-[12rem] text-sm">
          <span className="mb-1 block text-muted">Health</span>
          <select name="health" defaultValue={currentHealth} className={adminSelectClass}>
            <option value="all">All</option>
            <option value="needs_attention">Needs attention</option>
            <option value="recommendations">Recommendations</option>
            <option value="healthy">Ready</option>
            <option value="draft_ready">Drafts ready</option>
            <option value="draft_not_ready">Drafts not ready</option>
          </select>
        </label>
        <label className="min-w-[12rem] text-sm">
          <span className="mb-1 block text-muted">Type</span>
          <select name="type" defaultValue={currentType} className={adminSelectClass}>
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-muted">Search</span>
          <input
            name="q"
            defaultValue={currentQuery}
            placeholder="Recipe title"
            className={adminInputClass}
          />
        </label>
        <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
          Apply
        </button>
        <Link href="/admin/content-health" className={`${adminLinkClass} ${adminFocusRing} text-sm`}>
          Clear
        </Link>
      </form>

      {summary.needsAttentionCount === 0 &&
      summary.recommendationsCount === 0 &&
      filters.health === "all" &&
      filters.publication === "all" &&
      !filters.query &&
      !filters.typeId ? (
        <p className="rounded-sm border border-line bg-sand/30 px-4 py-3 text-sm text-muted" role="status">
          Content is in good shape. No published recipes currently need attention.
        </p>
      ) : null}

      {needsAttention.length > 0 ? (
        <section className="space-y-3" aria-labelledby="needs-attention-heading">
          <h2 id="needs-attention-heading" className="font-serif text-2xl text-ink">
            Needs attention
          </h2>
          <p className="text-sm text-muted">
            Published recipes with blocking readiness issues. Public pages are not auto-unpublished.
          </p>
          <ul className="space-y-3">
            {needsAttention.map((row) => (
              <RecipeHealthRow key={row.recipeId} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {recommendations.length > 0 ? (
        <section className="space-y-3" aria-labelledby="recommendations-heading">
          <h2 id="recommendations-heading" className="font-serif text-2xl text-ink">
            Recommendations
          </h2>
          <p className="text-sm text-muted">Published and usable, with non-blocking improvements.</p>
          <ul className="space-y-3">
            {recommendations.map((row) => (
              <RecipeHealthRow key={row.recipeId} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {draftReady.length > 0 ? (
        <section className="space-y-3" aria-labelledby="drafts-ready-heading">
          <h2 id="drafts-ready-heading" className="font-serif text-2xl text-ink">
            Drafts ready
          </h2>
          <ul className="space-y-3">
            {draftReady.map((row) => (
              <RecipeHealthRow key={row.recipeId} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {draftNotReady.length > 0 ? (
        <section className="space-y-3" aria-labelledby="drafts-not-ready-heading">
          <h2 id="drafts-not-ready-heading" className="font-serif text-2xl text-ink">
            Drafts not ready
          </h2>
          <p className="text-sm text-muted">Incomplete drafts — expected while editing.</p>
          <ul className="space-y-3">
            {draftNotReady.map((row) => (
              <RecipeHealthRow key={row.recipeId} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {healthy.length > 0 ? (
        <section className="space-y-3" aria-labelledby="healthy-heading">
          <h2 id="healthy-heading" className="font-serif text-2xl text-ink">
            Ready — {healthy.length} {healthy.length === 1 ? "recipe" : "recipes"}
          </h2>
          <div className="overflow-x-auto rounded-sm border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className={adminTableHeadClass}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Recipe</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {healthy.map((row) => (
                  <tr key={row.recipeId} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{row.title}</td>
                    <td className="px-3 py-2 text-muted">{row.typeName}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/recipes/${row.recipeId}`}
                        className={`${adminLinkClass} ${adminFocusRing}`}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted" role="status">
          No recipes match these filters.{" "}
          <Link href={buildFilterHref({})} className={`${adminLinkClass} ${adminFocusRing}`}>
            Clear filters
          </Link>
        </p>
      ) : null}

      <p className="text-xs text-muted">
        Evaluating {rows.length} {rows.length === 1 ? "recipe" : "recipes"} from Publishing
        Readiness. Soft catalog warnings are not duplicated here.
      </p>
    </div>
  );
}
