"use client";

import { useId, useMemo, useState } from "react";
import {
  filterPublicIngredientOptions,
  type PublicIngredientOption,
} from "@/lib/ingredient-discovery";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/**
 * Shared canonical Ingredient combobox for public discovery surfaces (ING-5 / ING-6).
 * Options are always canonical; alias text is search-only.
 */
export function PublicIngredientPicker({
  id,
  label,
  options,
  selected,
  excludedFromAdd,
  maxSelections,
  onAdd,
  placeholder = "Search ingredients",
}: {
  id: string;
  label: string;
  options: PublicIngredientOption[];
  selected: string[];
  excludedFromAdd: Set<string>;
  maxSelections: number;
  onAdd: (slug: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const atLimit = selected.length >= maxSelections;
  const available = useMemo(
    () =>
      filterPublicIngredientOptions(
        options.filter((option) => !excludedFromAdd.has(option.slug)),
        query,
        10,
      ),
    [excludedFromAdd, options, query],
  );

  return (
    <div className="grid min-w-[14rem] flex-1 gap-1 text-sm">
      <label htmlFor={id} className="text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={query.trim().length > 0 && available.length > 0 && !atLimit}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-disabled={atLimit}
          disabled={atLimit}
          className={`min-h-11 w-full rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 disabled:cursor-not-allowed disabled:opacity-60 ${controlFocus}`}
        />
        {query.trim() && available.length > 0 && !atLimit ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-paper py-1 shadow-md"
          >
            {available.map((option) => (
              <li key={option.slug} role="option" aria-selected="false">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-cream ${controlFocus}`}
                  onClick={() => {
                    onAdd(option.slug);
                    setQuery("");
                  }}
                >
                  <span>{option.name}</span>
                  <span className="tabular-nums text-xs text-muted">{option.recipeCount}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {selected.length ? (
        <p className="sr-only">
          {selected.length} selected
          {atLimit ? `, maximum ${maxSelections}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function PublicIngredientChips({
  slugs,
  options,
  onRemove,
  prefix = "",
}: {
  slugs: string[];
  options: PublicIngredientOption[];
  onRemove: (slug: string) => void;
  /** Optional chip label prefix (e.g. "Exclude: "). */
  prefix?: string;
}) {
  if (!slugs.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {slugs.map((slug) => {
        const option = options.find((row) => row.slug === slug);
        const name = option?.name ?? slug;
        return (
          <button
            key={slug}
            type="button"
            className={`inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-cream px-2.5 text-sm text-ink ${controlFocus}`}
            onClick={() => onRemove(slug)}
            aria-label={`Remove ${prefix}${name}`}
          >
            {prefix}
            {name}
            <span aria-hidden="true">×</span>
          </button>
        );
      })}
    </div>
  );
}
