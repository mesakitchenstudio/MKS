"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  browserLocalTodayYmd,
  parseMealPlanWeekParam,
  startOfWeekMonday,
  validateMealPlanDateHorizon,
} from "@/lib/meal-planner";

/**
 * Client-only week resolution — avoids SSR timezone mismatch.
 * Snaps malformed/out-of-horizon week params to the local current week Monday.
 */
export function MealPlannerWeekBootstrap({
  planId,
  weekParam,
}: {
  planId: string;
  weekParam?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const today = browserLocalTodayYmd();
    let weekStart = startOfWeekMonday(today) ?? today;

    if (weekParam) {
      const parsed = parseMealPlanWeekParam(weekParam, today);
      if (parsed.ok) {
        weekStart = parsed.weekStart;
      } else {
        const snapped = parseMealPlanWeekParam(weekParam);
        if (snapped.ok) {
          const horizon = validateMealPlanDateHorizon(snapped.weekStart, today);
          weekStart = horizon.ok ? snapped.weekStart : (startOfWeekMonday(today) ?? today);
        }
      }
    }

    router.replace(`/profile/meal-planner/${planId}?week=${weekStart}`);
  }, [planId, weekParam, router]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12" aria-busy="true">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Meal Planner
      </p>
      <h1 className="mt-3 font-serif text-4xl text-ink md:text-5xl">Opening your week</h1>
      <p className="mt-3 text-muted" role="status" aria-live="polite">
        Matching dates to your local calendar…
      </p>
    </div>
  );
}
