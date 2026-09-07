"use client";

import { RELATED_RECIPE_MANUAL_MAX } from "@/lib/recipe-related-overrides";

export type RelatedRecipePinCandidate = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

const selectClass =
  "w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/**
 * Optional ordered pins for the public related-recipe shelf.
 * Empty = automatic ranking only.
 */
export function RelatedRecipePinsEditor({
  value,
  onChange,
  candidates,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  candidates: RelatedRecipePinCandidate[];
}) {
  const byId = new Map(candidates.map((row) => [row.id, row]));
  const selected = value
    .map((id) => byId.get(id))
    .filter((row): row is RelatedRecipePinCandidate => Boolean(row));
  const available = candidates.filter((row) => !value.includes(row.id));

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    onChange(next);
  }

  return (
    <div className="mt-6 border-t border-line/70 pt-5">
      <h4 className="text-sm font-semibold text-ink">Related recipes</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Optional. Pinned recipes appear first on “More from the studio”. Leave empty for automatic
        suggestions. Does not replace Series membership.
      </p>

      {value.map((id) => (
        <input key={id} type="hidden" name="relatedRecipeIds" value={id} />
      ))}

      {selected.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {selected.map((row, index) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-cream/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                <p className="truncate text-xs text-muted">
                  /{row.slug}
                  {row.status !== "published" ? " · not published" : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${row.title} up`}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
                  onClick={() => move(index, 1)}
                  disabled={index === selected.length - 1}
                  aria-label={`Move ${row.title} down`}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
                  onClick={() => onChange(value.filter((item) => item !== row.id))}
                  aria-label={`Remove ${row.title}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {value.length < RELATED_RECIPE_MANUAL_MAX && available.length > 0 ? (
        <label className="mt-3 grid max-w-lg gap-1.5">
          <span className="text-xs font-semibold text-ink">Add recipe</span>
          <select
            className={selectClass}
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (!id) return;
              onChange([...value, id].slice(0, RELATED_RECIPE_MANUAL_MAX));
              event.target.value = "";
            }}
          >
            <option value="">Select a recipe…</option>
            {available.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
                {row.status !== "published" ? " (draft)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {value.length >= RELATED_RECIPE_MANUAL_MAX ? (
        <p className="mt-2 text-xs text-muted">Maximum {RELATED_RECIPE_MANUAL_MAX} pinned recipes.</p>
      ) : null}
    </div>
  );
}
