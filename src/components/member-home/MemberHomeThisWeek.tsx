"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { getMemberHomeThisWeekAction } from "@/app/profile/member-home-actions";
import { MemberHomeButtonLink } from "@/components/member-home/RecommendationRecipeCard";
import { authFocusRing } from "@/lib/auth-ui";
import {
  mealSlotLabel,
  parseCivilDateParts,
  type MealSlot,
} from "@/lib/meal-planner";
import type { MemberHomeMealPreview, MemberHomePlannerSummary } from "@/lib/member-home";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function browserLocalYmd(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMealDay(ymd: string): string {
  const parts = parseCivilDateParts(ymd);
  if (!parts) return ymd;
  const weekday =
    WEEKDAY_SHORT[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  return `${weekday} ${parts.month}/${parts.day}`;
}

function mealSlotDisplay(slot: MealSlot): string {
  return mealSlotLabel(slot);
}

export function MemberHomeThisWeek({
  initialPlanner,
}: {
  /** Server planner without week resolution (hasPlan / plan name only). */
  initialPlanner: MemberHomePlannerSummary;
}) {
  const [planner, setPlanner] = useState<MemberHomePlannerSummary>(initialPlanner);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    initialPlanner.hasPlan ? "loading" : "ready",
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!initialPlanner.enabled) return;
    if (!initialPlanner.hasPlan) return;

    const weekAnchorYmd = browserLocalYmd();
    startTransition(() => {
      void (async () => {
        const result = await getMemberHomeThisWeekAction(weekAnchorYmd);
        if (!result.ok) {
          setStatus("unavailable");
          return;
        }
        setPlanner(result.planner);
        setStatus("ready");
      })();
    });
  }, [initialPlanner.enabled, initialPlanner.hasPlan]);

  if (!initialPlanner.enabled) return null;

  if (!initialPlanner.hasPlan) {
    return (
      <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-this-week">
        <h2 id="member-home-this-week" className="break-words font-serif text-3xl text-ink">
          This week
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-muted">
          Plan a few meals for the week ahead. Private to your account.
        </p>
        <div className="mt-4">
          <MemberHomeButtonLink href="/profile/meal-planner">Start Meal Planning</MemberHomeButtonLink>
        </div>
      </section>
    );
  }

  const planName = planner.plan?.name || initialPlanner.plan?.name || "Meal Plan";
  const meals: MemberHomeMealPreview[] = status === "ready" ? planner.nextMeals : [];

  return (
    <section className="mt-8 border-t border-line pt-8" aria-labelledby="member-home-this-week">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="member-home-this-week" className="break-words font-serif text-3xl text-ink">
            This week
          </h2>
          <p className="mt-1.5 break-words text-sm text-muted">
            From <span className="font-semibold text-ink">{planName}</span>
          </p>
        </div>
        <Link
          href="/profile/meal-planner"
          className={`inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 ${authFocusRing}`}
        >
          Open Meal Planner
        </Link>
      </div>

      {status === "loading" ? (
        <div
          className="mt-5 space-y-3"
          aria-busy="true"
          aria-live="polite"
          aria-label="Loading this week’s meals"
        >
          <div className="h-12 rounded-sm bg-sand/70" />
          <div className="h-12 rounded-sm bg-sand/50" />
          <div className="h-12 max-w-md rounded-sm bg-sand/40" />
        </div>
      ) : null}

      {status === "unavailable" ? (
        <p className="mt-5 text-sm text-muted" role="status">
          This week’s meals could not be loaded. Open Meal Planner to continue.
        </p>
      ) : null}

      {status === "ready" && meals.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          No upcoming meals on this plan for the rest of the week.
        </p>
      ) : null}

      {status === "ready" && meals.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {meals.map((meal) => (
            <li
              key={meal.itemId}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/70 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                  {formatMealDay(meal.planDate)} · {mealSlotDisplay(meal.mealSlot)}
                </p>
                <Link
                  href={`/recipes/${meal.recipeSlug}`}
                  className={`mt-1 inline-block break-words font-serif text-xl text-ink hover:text-terracotta ${authFocusRing} rounded-sm`}
                >
                  {meal.recipeTitle}
                </Link>
              </div>
              <p className="shrink-0 text-sm text-muted">
                {meal.plannedServings}{" "}
                {meal.plannedServings === 1 ? "serving" : "servings"}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
