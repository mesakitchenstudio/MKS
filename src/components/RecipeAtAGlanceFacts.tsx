import type { Recipe } from "@/data/types";
import type { ExtraField } from "@/lib/recipe-map";
import { publicRestLabel, publicRestMinutes } from "@/lib/recipe-timing";
import {
  difficultyLabel,
  formatTime,
  heatTimingRing,
  totalMinutes,
} from "@/lib/recipe-utils";

type GlanceItem = { label: string; value: string };

export function RecipeAtAGlanceFacts({
  recipe,
  className = "",
}: {
  recipe: Recipe & { extras?: ExtraField[] };
  className?: string;
}) {
  const heat = heatTimingRing(recipe);
  const rest = publicRestMinutes(recipe);
  const restLabel = publicRestLabel(recipe);
  const total = totalMinutes(recipe);

  const items: GlanceItem[] = [];
  if (recipe.prepMinutes > 0) items.push({ label: "Prep", value: formatTime(recipe.prepMinutes) });
  if (heat && heat.minutes > 0) items.push({ label: heat.label, value: formatTime(heat.minutes) });
  if (rest > 0) items.push({ label: restLabel, value: formatTime(rest) });
  if (total > 0) items.push({ label: "Total", value: formatTime(total) });
  items.push({ label: "Yield", value: `${recipe.servings} ${recipe.servingsUnit}` });
  items.push({ label: "Difficulty", value: difficultyLabel(recipe.difficulty) });

  return (
    <dl
      aria-label="Recipe at a glance"
      className={`grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-6 ${className}`}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
