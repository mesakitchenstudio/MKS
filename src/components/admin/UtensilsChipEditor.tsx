"use client";

import { useId, useState } from "react";
import { adminFocusRing, adminSecondaryButtonClass, adminTertiaryButtonClass } from "@/lib/admin-ui";
import { coerceStringList } from "@/lib/coerce-string-list";

export function UtensilsChipEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const items = coerceStringList(value);

  function addItem(raw: string) {
    const next = raw.trim();
    if (!next) return;
    if (items.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, next]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line bg-cream/40 px-2 py-1 text-sm text-ink"
          >
            <span className="truncate">{item}</span>
            <button
              type="button"
              className={`${adminTertiaryButtonClass} px-1 py-0 text-xs`}
              aria-label={`Remove ${item}`}
              disabled={disabled}
              onClick={() => onChange(items.filter((_, rowIndex) => rowIndex !== index))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={inputId}>
          Add utensil
        </label>
        <input
          id={inputId}
          type="text"
          value={draft}
          disabled={disabled}
          placeholder="Add utensil"
          className="h-9 min-w-[10rem] flex-1 rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem(draft);
            }
          }}
        />
        <button
          type="button"
          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          disabled={disabled || !draft.trim()}
          onClick={() => addItem(draft)}
        >
          + Add utensil
        </button>
      </div>
    </div>
  );
}
