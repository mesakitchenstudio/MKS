"use client";

import {
  CONTEXTUAL_INTERNAL_LINK_MAX,
  normalizeContextualInternalLinks,
} from "@/lib/contextual-internal-links";
import type {
  AdminInternalLinkAcceptedTarget,
  AdminInternalLinkPickerCandidate,
  AdminInternalLinkSuggestion,
} from "@/lib/internal-link-recommendations-admin";

const selectClass =
  "w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export type ContextualInternalLinksEditorProps = {
  sourceRecipeId: string;
  /** Ordered accepted recipe IDs in editor state */
  value: string[];
  onChange: (nextIds: string[]) => void;
  suggestions: AdminInternalLinkSuggestion[];
  suggestionsError?: boolean;
  acceptedTargets: AdminInternalLinkAcceptedTarget[];
  acceptedTargetsError?: boolean;
  pickerCandidates: AdminInternalLinkPickerCandidate[];
};

function targetPresentation(
  recipeId: string,
  acceptedTargets: AdminInternalLinkAcceptedTarget[],
  pickerCandidates: AdminInternalLinkPickerCandidate[],
): {
  title: string;
  slug: string;
  statusLabel: string | null;
  available: boolean;
} {
  const accepted = acceptedTargets.find((row) => row.recipeId === recipeId);
  if (accepted) {
    if (accepted.missing) {
      return {
        title: "Target no longer available",
        slug: "",
        statusLabel: null,
        available: false,
      };
    }
    if (!accepted.available) {
      return {
        title: accepted.title || "Target currently unavailable",
        slug: accepted.slug,
        statusLabel: "Draft — currently unavailable",
        available: false,
      };
    }
    return {
      title: accepted.title,
      slug: accepted.slug,
      statusLabel: null,
      available: true,
    };
  }
  const picker = pickerCandidates.find((row) => row.id === recipeId);
  if (picker) {
    return {
      title: picker.title,
      slug: picker.slug,
      statusLabel: picker.status !== "published" ? "not published" : null,
      available: picker.status === "published",
    };
  }
  return {
    title: "Target currently unavailable",
    slug: "",
    statusLabel: null,
    available: false,
  };
}

/**
 * Admin editorial UI for #11 contextual internal links.
 * Edits local RecipeEditor state only — persists on Recipe Save.
 */
export function ContextualInternalLinksEditor({
  sourceRecipeId,
  value,
  onChange,
  suggestions,
  suggestionsError = false,
  acceptedTargets,
  acceptedTargetsError = false,
  pickerCandidates,
}: ContextualInternalLinksEditorProps) {
  const ids = normalizeContextualInternalLinks(
    value.map((recipeId) => ({ recipeId })),
    sourceRecipeId,
  )?.map((item) => item.recipeId) ?? [];

  const atMax = ids.length >= CONTEXTUAL_INTERNAL_LINK_MAX;
  const acceptedSet = new Set(ids);

  const visibleSuggestions = suggestions.filter(
    (row) => !acceptedSet.has(row.recipeId) && row.recipeId !== sourceRecipeId,
  );

  const availablePicker = pickerCandidates.filter(
    (row) =>
      row.id !== sourceRecipeId &&
      !acceptedSet.has(row.id) &&
      row.status === "published",
  );

  function setIds(next: string[]) {
    const normalized =
      normalizeContextualInternalLinks(
        next.map((recipeId) => ({ recipeId })),
        sourceRecipeId,
      )?.map((item) => item.recipeId) ?? [];
    onChange(normalized);
  }

  function move(index: number, delta: number) {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setIds(next);
  }

  function add(recipeId: string) {
    if (atMax) return;
    if (!recipeId || recipeId === sourceRecipeId || acceptedSet.has(recipeId)) return;
    setIds([...ids, recipeId]);
  }

  return (
    <div className="mt-6 min-w-0 max-w-full border-t border-line/70 pt-5">
      <h4 className="text-sm font-semibold text-ink">Internal links</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Mesa suggests relevant Recipes you may want to link from this Recipe. Add up to{" "}
        {CONTEXTUAL_INTERNAL_LINK_MAX}. Changes save with the Recipe.
      </p>

      <div className="mt-4 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Suggestions</p>
        {suggestionsError ? (
          <p className="mt-2 text-sm text-muted" role="status">
            Recommendations temporarily unavailable.
          </p>
        ) : visibleSuggestions.length === 0 ? (
          <p className="mt-2 text-sm text-muted" role="status">
            No strong internal-link recommendations yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {visibleSuggestions.map((row) => {
              const reasonText = row.reasons.join(" · ");
              return (
                <li
                  key={row.recipeId}
                  className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-sm border border-line bg-cream/20 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-ink">{row.title}</p>
                    {reasonText ? (
                      <p className="mt-0.5 break-words text-xs text-muted">{reasonText}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-sm px-2 py-1 text-xs font-semibold text-terracotta hover:bg-terracotta/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={atMax}
                    onClick={() => add(row.recipeId)}
                    aria-label={`Add ${row.title} as an internal link`}
                  >
                    Add
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Current links ({ids.length} of {CONTEXTUAL_INTERNAL_LINK_MAX})
        </p>
        {acceptedTargetsError ? (
          <p className="mt-2 text-sm text-muted" role="status">
            Some link details could not be loaded. Saved selections are still kept.
          </p>
        ) : null}
        {ids.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No internal links selected yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {ids.map((recipeId, index) => {
              const presentation = targetPresentation(
                recipeId,
                acceptedTargets,
                pickerCandidates,
              );
              return (
                <li
                  key={recipeId}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-cream/20 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-ink">
                      {index + 1}. {presentation.title}
                    </p>
                    <p className="break-words text-xs text-muted">
                      {presentation.slug ? `/${presentation.slug}` : null}
                      {presentation.statusLabel
                        ? `${presentation.slug ? " · " : ""}${presentation.statusLabel}`
                        : null}
                      {!presentation.available && !presentation.statusLabel
                        ? "Unavailable"
                        : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-40"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${presentation.title} up`}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-40"
                      onClick={() => move(index, 1)}
                      disabled={index === ids.length - 1}
                      aria-label={`Move ${presentation.title} down`}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
                      onClick={() => setIds(ids.filter((id) => id !== recipeId))}
                      aria-label={`Remove ${presentation.title} from internal links`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!atMax && availablePicker.length > 0 ? (
        <label className="mt-4 grid max-w-lg gap-1.5">
          <span className="text-xs font-semibold text-ink">Add recipe</span>
          <select
            className={selectClass}
            value=""
            aria-label="Add recipe as an internal link"
            onChange={(event) => {
              const id = event.target.value;
              if (!id) return;
              add(id);
              event.target.value = "";
            }}
          >
            <option value="">Select a recipe…</option>
            {availablePicker.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {atMax ? (
        <p className="mt-2 text-xs text-muted">Maximum {CONTEXTUAL_INTERNAL_LINK_MAX} internal links.</p>
      ) : null}
    </div>
  );
}
