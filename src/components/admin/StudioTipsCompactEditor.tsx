"use client";

import { useState } from "react";
import { EditorDragHandle, EditorRowActions } from "@/components/admin/EditorRowActions";
import { adminFocusRing, adminInputClass } from "@/lib/admin-ui";
import { coerceStringList } from "@/lib/coerce-string-list";

const editorTextAction = `text-sm font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`;

function moveArrayItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed!);
  return next;
}

export function StudioTipsCompactEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (value: string[]) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const tips = coerceStringList(items);

  return (
    <div className="max-w-3xl space-y-1.5">
      {tips.map((item, index) => {
        const preview = item.trim();
        const expanded = expandedIndex === index;
        const oneLine = preview.replace(/\s+/g, " ");

        return (
          <div key={index} className="border-b border-line/60 last:border-b-0">
            <div className="flex items-start gap-2 py-1.5">
              <EditorDragHandle label={`studio tip ${index + 1}`} />
              <button
                type="button"
                aria-expanded={expanded}
                className={`min-w-0 flex-1 py-1 text-left ${adminFocusRing}`}
                onClick={() => setExpandedIndex(expanded ? null : index)}
              >
                <span className="block truncate text-sm text-ink">
                  {oneLine || `Tip ${index + 1}`}
                </span>
              </button>
              <EditorRowActions
                itemLabel={`studio tip ${index + 1}`}
                upDisabled={index === 0}
                downDisabled={index === tips.length - 1}
                onMoveUp={() => onChange(moveArrayItem(tips, index, index - 1))}
                onMoveDown={() => onChange(moveArrayItem(tips, index, index + 1))}
                onRemove={() => onChange(tips.filter((_, rowIndex) => rowIndex !== index))}
              />
            </div>
            {expanded ? (
              <div className="pb-2 pl-8">
                <textarea
                  value={item}
                  rows={3}
                  aria-label={`Studio tip ${index + 1}`}
                  onChange={(event) => {
                    const next = [...tips];
                    next[index] = event.target.value;
                    onChange(next);
                  }}
                  className={`${adminInputClass} h-auto min-h-[4rem] w-full resize-y`}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <button type="button" className={editorTextAction} onClick={() => onChange([...tips, ""])}>
        + Add tip
      </button>
    </div>
  );
}
