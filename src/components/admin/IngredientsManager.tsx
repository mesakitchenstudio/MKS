"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addIngredientAliasAction,
  createIngredientAction,
  removeIngredientAliasAction,
  resolveUnresolvedIngredientAction,
} from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import type {
  AdminIngredientCoverage,
  AdminIngredientListItem,
  AdminIngredientListPage,
  AdminUnresolvedPage,
} from "@/lib/ingredient-admin";
import { formatCoveragePercent } from "@/lib/ingredient-admin";
import {
  formatIngredientPublicSeoStatus,
  ingredientPublicPath,
} from "@/lib/ingredient-seo";

type Tab = "unresolved" | "ingredients";

type Props = {
  coverage: AdminIngredientCoverage;
  unresolved: AdminUnresolvedPage;
  ingredients: AdminIngredientListPage;
  ingredientOptions: Array<{ id: string; name: string; nameNorm: string }>;
  tab: Tab;
  message?: string;
  errorDetail?: string;
  expandIngredientId?: string;
  resolveKey?: string;
  initialAddOpen?: boolean;
  addName?: string;
  /** Public Ingredient SEO gate (server-resolved). */
  ingredientSeoEnabled?: boolean;
};

function CoverageCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/80 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Pagination({
  tab,
  page,
  pageSize,
  total,
  q,
}: {
  tab: Tab;
  page: number;
  pageSize: number;
  total: number;
  q: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const hrefFor = (next: number) => {
    const params = new URLSearchParams({ tab, page: String(next) });
    if (q) params.set("q", q);
    return `/admin/ingredients?${params.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <p>
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={adminSecondaryButtonClass}>
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={adminSecondaryButtonClass}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function IngredientDetail({
  item,
  defaultOpen,
  seoEnabled,
}: {
  item: AdminIngredientListItem;
  defaultOpen: boolean;
  seoEnabled: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const seoStatus = formatIngredientPublicSeoStatus({
    seoEnabled,
    publishedRecipeCount: item.publishedRecipeCount,
  });
  const showPublicLink = seoEnabled && item.publishedRecipeCount >= 1;
  return (
    <li className="border-b border-border/70 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className={`min-w-0 text-left ${adminFocusRing}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <p className="font-semibold text-ink">{item.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            {item.aliasCount} {item.aliasCount === 1 ? "alias" : "aliases"} ·{" "}
            {item.publishedRecipeCount} published · {item.recipeCount}{" "}
            {item.recipeCount === 1 ? "recipe" : "recipes"} · slug{" "}
            <span className="font-mono text-xs text-ink/80">{item.slug}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">SEO: {seoStatus}</p>
        </button>
        {showPublicLink ? (
          <a
            href={ingredientPublicPath(item.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${adminLinkClass} shrink-0`}
          >
            View public page
          </a>
        ) : !seoEnabled ? (
          <span className="shrink-0 text-xs text-muted">SEO disabled</span>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-cream/40 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Aliases</p>
            {item.aliases.length ? (
              <ul className="mt-2 space-y-1">
                {item.aliases.map((alias) => (
                  <li
                    key={alias.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {alias.alias}{" "}
                      <span className="font-mono text-xs text-muted">[{alias.aliasNorm}]</span>
                    </span>
                    <form action={removeIngredientAliasAction}>
                      <input type="hidden" name="aliasId" value={alias.id} />
                      <input type="hidden" name="ingredientId" value={item.id} />
                      <button type="submit" className={`${adminLinkClass} text-terracotta`}>
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">No aliases yet.</p>
            )}
          </div>
          <form action={addIngredientAliasAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="ingredientId" value={item.id} />
            <div className="min-w-[14rem] flex-1">
              <label className="text-xs font-semibold text-muted" htmlFor={`alias-${item.id}`}>
                Add alias
              </label>
              <input
                id={`alias-${item.id}`}
                name="alias"
                className={`${adminInputClass} mt-1`}
                placeholder="e.g. large free-range eggs"
                required
              />
            </div>
            <button type="submit" className={adminSecondaryButtonClass}>
              Add alias
            </button>
          </form>
          <p className="text-xs text-muted">
            Usage includes Draft, Scheduled, and Published recipes. Canonical text in Recipes is never
            rewritten.
          </p>
        </div>
      ) : null}
    </li>
  );
}

function ResolvePanel({
  authoredItemNorm,
  representativeAuthoredItem,
  ingredientOptions,
  page,
  q,
}: {
  authoredItemNorm: string;
  representativeAuthoredItem: string;
  ingredientOptions: Array<{ id: string; name: string }>;
  page: number;
  q: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-cream/40 p-3">
      <p className="text-sm text-muted">
        Map <span className="font-semibold text-ink">{representativeAuthoredItem}</span> to a
        canonical ingredient. Recipe wording stays unchanged.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className={mode === "existing" ? adminPrimaryButtonClass : adminSecondaryButtonClass}
          onClick={() => setMode("existing")}
        >
          Existing ingredient
        </button>
        <button
          type="button"
          className={mode === "new" ? adminPrimaryButtonClass : adminSecondaryButtonClass}
          onClick={() => setMode("new")}
        >
          New ingredient
        </button>
      </div>
      <form action={resolveUnresolvedIngredientAction} className="space-y-3">
        <input type="hidden" name="authoredItemNorm" value={authoredItemNorm} />
        <input type="hidden" name="representativeAuthoredItem" value={representativeAuthoredItem} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="q" value={q} />
        {mode === "existing" ? (
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor={`ing-${authoredItemNorm}`}>
              Canonical ingredient
            </label>
            <select
              id={`ing-${authoredItemNorm}`}
              name="ingredientId"
              className={`${adminInputClass} mt-1`}
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select…
              </option>
              {ingredientOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor={`new-${authoredItemNorm}`}>
              Canonical ingredient name
            </label>
            <input
              id={`new-${authoredItemNorm}`}
              name="canonicalName"
              className={`${adminInputClass} mt-1`}
              placeholder="e.g. Orange juice"
              required
            />
            <p className="mt-1 text-xs text-muted">
              Do not paste long authored phrases as the canonical name. Prefer a clear identity like
              “Orange juice”.
            </p>
          </div>
        )}
        <button type="submit" className={adminPrimaryButtonClass}>
          Resolve
        </button>
      </form>
    </div>
  );
}

export function IngredientsManager({
  coverage,
  unresolved,
  ingredients,
  ingredientOptions,
  tab,
  message,
  errorDetail,
  expandIngredientId,
  resolveKey,
  initialAddOpen,
  addName,
  ingredientSeoEnabled = false,
}: Props) {
  const [addOpen, setAddOpen] = useState(Boolean(initialAddOpen));
  const [openResolve, setOpenResolve] = useState(resolveKey || "");

  const emptyHint = useMemo(() => {
    if (coverage.emptyVocabulary && coverage.emptyIndex) {
      return "No ingredient identity data is available yet. After migration, operators seed vocabulary and backfill indexes outside this page.";
    }
    if (coverage.emptyIndex) {
      return "Canonical ingredients may exist, but no RecipeIngredient index rows are present yet. Run the operator backfill after deployment.";
    }
    return null;
  }, [coverage.emptyIndex, coverage.emptyVocabulary]);

  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader
        title="Ingredients"
        description="Manage canonical ingredient identities used for recipe discovery. Authored recipe wording is not rewritten."
        documentationTopicId="ingredients"
        className="mb-0"
        actions={
          <button
            type="button"
            className={adminPrimaryButtonClass}
            onClick={() => setAddOpen((value) => !value)}
          >
            {addOpen ? "Close" : "New ingredient"}
          </button>
        }
      />

      {message ? (
        <p className="rounded-md border border-border bg-white px-3 py-2 text-sm text-ink" role="status">
          {message}
        </p>
      ) : null}
      {errorDetail ? (
        <p
          className="rounded-md border border-terracotta/40 bg-white px-3 py-2 text-sm font-semibold text-terracotta"
          role="alert"
        >
          {errorDetail}
        </p>
      ) : null}

      {addOpen ? (
        <form
          action={createIngredientAction}
          className="space-y-3 rounded-lg border border-border bg-white p-4"
        >
          <input type="hidden" name="tab" value="ingredients" />
          <div>
            <label htmlFor="new-ingredient-name" className="text-sm font-semibold text-ink">
              Canonical name
            </label>
            <input
              id="new-ingredient-name"
              name="name"
              className={`${adminInputClass} mt-1.5`}
              defaultValue={addName || ""}
              placeholder="e.g. Egg yolk"
              required
            />
            <p className="mt-1.5 text-xs text-muted">
              Creates a stable identity and slug. Prefer deliberate names over long recipe phrases.
            </p>
          </div>
          <button type="submit" className={adminPrimaryButtonClass}>
            Create ingredient
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Coverage</h2>
        {emptyHint ? <p className="text-sm text-muted">{emptyHint}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CoverageCard label="Ingredients" value={String(coverage.canonicalIngredients)} />
          <CoverageCard label="Aliases" value={String(coverage.aliases)} />
          <CoverageCard
            label="Indexed rows"
            value={String(coverage.ingredientRowsIndexed)}
            hint={
              coverage.emptyIndex
                ? "No index data yet"
                : `${coverage.matched} matched · ${coverage.unresolved} unresolved`
            }
          />
          <CoverageCard
            label="Coverage"
            value={formatCoveragePercent(coverage)}
            hint={
              coverage.emptyIndex
                ? "Not applicable until indexed"
                : `${coverage.distinctUnresolvedKeys} distinct unresolved`
            }
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <Link
          href={`/admin/ingredients?tab=unresolved${unresolved.q ? `&q=${encodeURIComponent(unresolved.q)}` : ""}`}
          className={tab === "unresolved" ? adminPrimaryButtonClass : adminSecondaryButtonClass}
        >
          Unresolved
        </Link>
        <Link
          href={`/admin/ingredients?tab=ingredients${ingredients.q ? `&q=${encodeURIComponent(ingredients.q)}` : ""}`}
          className={tab === "ingredients" ? adminPrimaryButtonClass : adminSecondaryButtonClass}
        >
          Ingredients
        </Link>
      </div>

      {tab === "unresolved" ? (
        <section className="min-w-0">
          <form className="mb-4 flex flex-wrap gap-2" method="get">
            <input type="hidden" name="tab" value="unresolved" />
            <input
              name="q"
              defaultValue={unresolved.q}
              className={`${adminInputClass} max-w-sm`}
              placeholder="Search unresolved phrases"
              aria-label="Search unresolved"
            />
            <button type="submit" className={adminSecondaryButtonClass}>
              Search
            </button>
          </form>
          {unresolved.groups.length === 0 ? (
            <p className="text-sm text-muted">
              {coverage.emptyIndex
                ? "No unresolved rows yet — the ingredient index is empty."
                : unresolved.q
                  ? "No unresolved ingredients match that search."
                  : "No unresolved ingredients. Nice work."}
            </p>
          ) : (
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {unresolved.groups.map((group) => {
                const open = openResolve === group.authoredItemNorm;
                return (
                  <li key={group.authoredItemNorm} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{group.representativeAuthoredItem}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          <span className="font-mono text-xs">{group.authoredItemNorm}</span>
                          {" · "}
                          {group.occurrenceCount}{" "}
                          {group.occurrenceCount === 1 ? "occurrence" : "occurrences"} ·{" "}
                          {group.recipeCount} {group.recipeCount === 1 ? "recipe" : "recipes"}
                        </p>
                        {group.recipeTitles.length ? (
                          <p className="mt-1 text-xs text-muted">
                            {group.recipeTitles.join(" · ")}
                            {group.recipeCount > group.recipeTitles.length ? " · …" : ""}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={adminSecondaryButtonClass}
                        onClick={() =>
                          setOpenResolve((current) =>
                            current === group.authoredItemNorm ? "" : group.authoredItemNorm,
                          )
                        }
                      >
                        {open ? "Close" : "Resolve"}
                      </button>
                    </div>
                    {open ? (
                      <ResolvePanel
                        authoredItemNorm={group.authoredItemNorm}
                        representativeAuthoredItem={group.representativeAuthoredItem}
                        ingredientOptions={ingredientOptions}
                        page={unresolved.page}
                        q={unresolved.q}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination
            tab="unresolved"
            page={unresolved.page}
            pageSize={unresolved.pageSize}
            total={unresolved.totalGroups}
            q={unresolved.q}
          />
        </section>
      ) : (
        <section className="min-w-0">
          <form className="mb-4 flex flex-wrap gap-2" method="get">
            <input type="hidden" name="tab" value="ingredients" />
            <input
              name="q"
              defaultValue={ingredients.q}
              className={`${adminInputClass} max-w-sm`}
              placeholder="Search ingredients or aliases"
              aria-label="Search ingredients"
            />
            <button type="submit" className={adminSecondaryButtonClass}>
              Search
            </button>
          </form>
          {ingredients.items.length === 0 ? (
            <p className="text-sm text-muted">
              {ingredients.q
                ? "No ingredients match that search."
                : "No canonical ingredients yet."}
            </p>
          ) : (
            <ul className="border-y border-border/70">
              {ingredients.items.map((item) => (
                <IngredientDetail
                  key={item.id}
                  item={item}
                  defaultOpen={expandIngredientId === item.id}
                  seoEnabled={ingredientSeoEnabled}
                />
              ))}
            </ul>
          )}
          <Pagination
            tab="ingredients"
            page={ingredients.page}
            pageSize={ingredients.pageSize}
            total={ingredients.total}
            q={ingredients.q}
          />
        </section>
      )}
    </div>
  );
}
