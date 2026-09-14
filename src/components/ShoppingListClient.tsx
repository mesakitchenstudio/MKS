"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  applyRecipeContributions,
  buildShoppingListView,
  clearPurchasedContributions,
  clearShoppingList,
  emptyShoppingListState,
  formatShoppingListPlainText,
  loadShoppingListState,
  parseShoppingListState,
  removeContributionsByIds,
  removeRecipeContributions,
  saveShoppingListState,
  serializeShoppingListState,
  setPurchasedKey,
  SHOPPING_LIST_PATH,
  SHOPPING_LIST_STORAGE_KEY,
  type ApplyRecipeContributionsResult,
  type ShoppingListContribution,
  type ShoppingListState,
  type ShoppingListView,
} from "@/lib/shopping-list";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const EMPTY_SERIALIZED =
  serializeShoppingListState(emptyShoppingListState()) ??
  '{"version":1,"contributions":[],"purchasedKeys":[]}';

function subscribeShoppingList(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("mesa-shopping-list-changed", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("mesa-shopping-list-changed", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readShoppingListSnapshot(): string {
  try {
    if (typeof window === "undefined") return EMPTY_SERIALIZED;
    return window.localStorage.getItem(SHOPPING_LIST_STORAGE_KEY) ?? EMPTY_SERIALIZED;
  } catch {
    return EMPTY_SERIALIZED;
  }
}

export type ShoppingListAddResult = {
  outcome: ApplyRecipeContributionsResult["outcome"];
  message: string;
  href: string;
};

/** Shared helper for Recipe / CWYW CTAs. */
export function commitShoppingListAdd(
  contributions: ShoppingListContribution[],
): ShoppingListAddResult {
  const current = loadShoppingListState();
  const result = applyRecipeContributions(current, contributions);
  if (result.outcome !== "noop" && result.outcome !== "kept_full") {
    saveShoppingListState(result.state);
  }
  return {
    outcome: result.outcome,
    message: result.message,
    href: SHOPPING_LIST_PATH,
  };
}

function useShoppingListState(): ShoppingListState {
  const raw = useSyncExternalStore(
    subscribeShoppingList,
    readShoppingListSnapshot,
    () => EMPTY_SERIALIZED,
  );
  return useMemo(() => parseShoppingListState(raw), [raw]);
}

export function ShoppingListClient({
  cwywEnabled = false,
}: {
  cwywEnabled?: boolean;
}) {
  const state = useShoppingListState();
  const [copyStatus, setCopyStatus] = useState("");
  const confirmId = useId();
  const view: ShoppingListView = buildShoppingListView(state);
  const trackedOpen = useRef(false);

  useEffect(() => {
    if (trackedOpen.current) return;
    trackedOpen.current = true;
    trackEvent("shopping_list_open", {
      item_count: view.itemCount,
      recipe_count: view.recipeCount,
    });
  }, [view.itemCount, view.recipeCount]);

  function commit(next: ShoppingListState) {
    saveShoppingListState(next);
  }

  async function copyList() {
    const text = formatShoppingListPlainText(view);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied shopping list.");
    } catch {
      setCopyStatus("Could not copy. Select and copy the list manually.");
    }
    window.setTimeout(() => setCopyStatus(""), 2500);
  }

  function printList() {
    window.print();
  }

  function onClearPurchased() {
    const ids = view.purchased.flatMap((row) => row.contributionIds);
    commit(clearPurchasedContributions(state, ids));
  }

  function onClearList() {
    const ok = window.confirm("Clear your entire shopping list?");
    if (!ok) return;
    trackEvent("shopping_list_clear", { item_count: view.itemCount });
    commit(clearShoppingList());
  }

  if (!state.contributions.length) {
    return (
      <div className="mt-8 max-w-2xl">
        <p className="text-base leading-7 text-muted" role="status">
          Your shopping list is empty. Add ingredients from a Mesa recipe
          {cwywEnabled ? " or from Cook With What You Have" : ""}.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/recipes"
            className={`inline-flex min-h-11 items-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper hover:bg-terracotta-dark ${controlFocus}`}
          >
            Browse recipes
          </Link>
          {cwywEnabled ? (
            <Link
              href="/cook-with-what-you-have"
              className={`inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-terracotta ${controlFocus}`}
            >
              Cook with what you have
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="no-print">
        <p className="text-sm text-muted" role="status">
          {view.itemCount} item{view.itemCount === 1 ? "" : "s"} from {view.recipeCount}{" "}
          recipe{view.recipeCount === 1 ? "" : "s"}
        </p>

        {view.sources.length ? (
          <section className="mt-6" aria-labelledby="shopping-list-sources">
            <h2 id="shopping-list-sources" className="font-serif text-xl text-ink">
              Recipes in this list
            </h2>
            <ul className="mt-3 space-y-2">
              {view.sources.map((source) => (
                <li
                  key={source.recipeId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 py-2 text-sm"
                >
                  <span>
                    <Link
                      href={`/recipes/${source.recipeSlug}`}
                      className={`font-medium text-ink hover:text-terracotta ${controlFocus}`}
                    >
                      {source.recipeTitle}
                    </Link>
                    <span className="text-muted">
                      {" "}
                      · {source.servings} serving{source.servings === 1 ? "" : "s"}
                      {source.sourceMode === "CWYW_MISSING" ? " · missing only" : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
                    onClick={() => commit(removeRecipeContributions(state, source.recipeId))}
                    aria-label={`Remove ${source.recipeTitle} from shopping list`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8" aria-labelledby="shopping-list-items">
          <h2 id="shopping-list-items" className="sr-only">
            Items to buy
          </h2>
          <ul className="space-y-3">
            {view.unchecked.map((row) => (
              <ShoppingListRow
                key={row.key}
                row={row}
                onToggle={(checked) => commit(setPurchasedKey(state, row.key, checked))}
                onRemove={() => commit(removeContributionsByIds(state, row.contributionIds))}
              />
            ))}
          </ul>
        </section>

        {view.purchased.length ? (
          <section className="mt-10" aria-labelledby="shopping-list-purchased">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="shopping-list-purchased" className="font-serif text-xl text-ink">
                Purchased
              </h2>
              <button
                type="button"
                className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
                onClick={onClearPurchased}
              >
                Clear purchased
              </button>
            </div>
            <ul className="mt-3 space-y-3">
              {view.purchased.map((row) => (
                <ShoppingListRow
                  key={row.key}
                  row={row}
                  onToggle={(checked) => commit(setPurchasedKey(state, row.key, checked))}
                  onRemove={() => commit(removeContributionsByIds(state, row.contributionIds))}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-6">
          <button
            type="button"
            onClick={copyList}
            className={`inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-terracotta ${controlFocus}`}
          >
            Copy list
          </button>
          <button
            type="button"
            onClick={printList}
            className={`inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-terracotta ${controlFocus}`}
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClearList}
            aria-describedby={confirmId}
            className={`inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
          >
            Clear list
          </button>
        </div>
        <p id={confirmId} className="sr-only">
          Clearing the list permanently removes all items from this browser.
        </p>
        {copyStatus ? (
          <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">
            {copyStatus}
          </p>
        ) : null}
      </div>

      <div className="shopping-list-print-sheet hidden print:block">
        <h1 className="font-serif text-3xl text-ink">Shopping List</h1>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-base text-ink">
          {view.unchecked.map((row) => (
            <li key={`print-${row.key}`}>
              {[row.amountDisplay, row.itemDisplay].filter(Boolean).join(" ")}
              {row.notesDisplay ? `, ${row.notesDisplay}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ShoppingListRow({
  row,
  onToggle,
  onRemove,
}: {
  row: ShoppingListView["unchecked"][number];
  onToggle: (checked: boolean) => void;
  onRemove: () => void;
}) {
  const label = [row.amountDisplay, row.itemDisplay, row.notesDisplay]
    .filter(Boolean)
    .join(", ");
  const sourceLine = row.sources.map((s) => s.recipeTitle).join(", ");

  return (
    <li className="flex gap-3 rounded-sm py-1">
      <input
        type="checkbox"
        className={`mt-1 h-5 w-5 shrink-0 accent-terracotta ${controlFocus}`}
        checked={row.purchased}
        onChange={(event) => onToggle(event.target.checked)}
        aria-label={row.purchased ? `Purchased: ${label}` : `Mark purchased: ${label}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-base leading-6 text-ink ${row.purchased ? "text-muted" : ""}`}>
          {row.amountDisplay ? (
            <span className="font-semibold">{row.amountDisplay} </span>
          ) : null}
          {row.itemDisplay}
          {row.notesDisplay ? <span className="text-muted">, {row.notesDisplay}</span> : null}
          {row.purchased ? <span className="sr-only"> (purchased)</span> : null}
        </p>
        {sourceLine ? (
          <p className="mt-0.5 text-sm text-muted">From {sourceLine}</p>
        ) : null}
      </div>
      <button
        type="button"
        className={`shrink-0 self-start text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        Remove
      </button>
    </li>
  );
}
