"use client";

import { useEffect } from "react";
import type { IngredientGroup } from "@/data/types";
import { clampRecipeServings, scaleAmount } from "@/lib/culinary-format";
import { ingredientCheckKey } from "@/lib/cooking-session";

export function CookingIngredientsList({
  groups,
  factor,
  servings,
  servingsUnit,
  checkedKeys,
  onToggle,
  onServingsChange,
  baseServings,
}: {
  groups: IngredientGroup[];
  factor: number;
  servings: number;
  servingsUnit: string;
  checkedKeys: Set<string>;
  onToggle: (key: string) => void;
  onServingsChange: (next: number) => void;
  baseServings: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-lg text-ink">Ingredients</h2>
        <div className="flex items-center gap-2" aria-label="Servings">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            onClick={() => onServingsChange(clampRecipeServings(servings - 1))}
            aria-label="Decrease servings"
          >
            −
          </button>
          <p className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums text-ink">
            {servings}{" "}
            <span className="font-normal text-muted">
              {servingsUnit || (baseServings === 1 ? "serving" : "servings")}
            </span>
          </p>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            onClick={() => onServingsChange(clampRecipeServings(servings + 1))}
            aria-label="Increase servings"
          >
            +
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((group, groupIndex) => (
          <div key={`${group.name ?? "group"}-${groupIndex}`}>
            {group.name?.trim() ? (
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {group.name}
              </h3>
            ) : null}
            <ul className="space-y-2">
              {group.items.map((item, itemIndex) => {
                const key = ingredientCheckKey(groupIndex, itemIndex);
                const checked = checkedKeys.has(key);
                const id = `cook-ing-${key}`;
                const amount = scaleAmount(item.amount, factor);
                const label = [amount, item.item].filter(Boolean).join(" ");
                return (
                  <li key={key}>
                    <label
                      htmlFor={id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 text-sm leading-6 ${
                        checked ? "text-muted line-through" : "text-ink"
                      }`}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(key)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--terracotta)]"
                      />
                      <span>
                        <span className="font-medium">{label}</span>
                        {item.notes?.trim() ? (
                          <span className="block text-xs text-muted no-underline">{item.notes}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CookingIngredientsSheet({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close ingredients"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-paper shadow-lg lg:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="font-[family-name:var(--font-fraunces)] text-lg text-ink">
            Ingredients
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-full px-3 text-sm font-semibold text-muted hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
