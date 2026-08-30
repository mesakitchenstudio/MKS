"use client";

import type { Recipe } from "@/data/types";
import type { ExtraField } from "@/lib/recipe-map";
import {
  heatTimingRing,
  difficultyLabel,
  formatTime,
} from "@/lib/recipe-utils";
import { publicRestLabel, publicRestMinutes } from "@/lib/recipe-timing";

const RING_FULL_MINUTES = 60;

function TimeRing({
  minutes,
  label,
}: {
  minutes: number;
  label: string;
}) {
  if (minutes <= 0) return null;

  const size = 92;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, minutes / RING_FULL_MINUTES);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-line"
            strokeWidth={stroke}
          />
          {progress > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--terracotta)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          ) : null}
        </svg>
        <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">
          {formatTime(minutes)}
        </p>
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function RecipeOverview({
  recipe,
}: {
  recipe: Recipe & { extras?: ExtraField[] };
}) {
  const heat = heatTimingRing(recipe);
  const rest = publicRestMinutes(recipe);
  const restLabel = publicRestLabel(recipe);
  const utensils = recipe.utensils?.filter(Boolean) ?? [];

  const rings = [
    { minutes: recipe.prepMinutes, label: "Preparation" as const },
    heat ? { minutes: heat.minutes, label: heat.label } : null,
    rest > 0 ? { minutes: rest, label: restLabel } : null,
  ].filter((ring): ring is { minutes: number; label: string } => ring != null && ring.minutes > 0);

  return (
    <div className="recipe-overview bg-paper px-0 py-6 text-ink">
      <p className="text-sm">
        Difficulty: <span className="font-semibold">{difficultyLabel(recipe.difficulty)}</span>
      </p>
      {rings.length ? (
        <div className="mt-5 flex flex-wrap justify-center gap-8 border-y border-line py-6 sm:justify-between sm:px-6">
          {rings.map((ring) => (
            <TimeRing key={ring.label} minutes={ring.minutes} label={ring.label} />
          ))}
        </div>
      ) : null}
      {utensils.length ? (
        <div className="mt-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">Utensils</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {utensils.map((item) => (
              <li key={item} className="rounded-full border border-line px-3 py-1 text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
