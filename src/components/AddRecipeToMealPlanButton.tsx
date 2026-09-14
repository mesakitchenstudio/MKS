"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  addMealPlanItemAction,
  ensureDefaultMealPlanAction,
  listMealPlansAction,
} from "@/app/profile/meal-plan-actions";
import { readSession } from "@/lib/auth-client";
import { authInputClass } from "@/lib/auth-ui";
import {
  MEAL_PLAN_DEFAULT_SLOT,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  browserLocalTodayYmd,
  mealPlanErrorMessage,
  mealPlannerHrefForDate,
  validateMealPlanDateHorizon,
  type MealSlot,
} from "@/lib/meal-planner";

const DIALOG_PRIMARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";
const DIALOG_SECONDARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

type PlanOption = { id: string; name: string };

export function AddRecipeToMealPlanButton({
  recipeId,
  recipeTitle,
  defaultServings,
}: {
  recipeId: string;
  recipeTitle: string;
  defaultServings: number;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ message: string; href: string | null } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openAuth() {
    window.dispatchEvent(new Event("mesa-open-auth"));
  }

  function onTrigger() {
    if (!readSession()) {
      openAuth();
      return;
    }
    setStatus(null);
    setOpen(true);
  }

  return (
    <div className="no-print mt-3">
      <button
        ref={triggerRef}
        type="button"
        onClick={onTrigger}
        className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
      >
        Add to Meal Plan
      </button>
      {status ? (
        <p className="mt-1 text-sm text-muted" role="status" aria-live="polite">
          {status.message}
          {status.href ? (
            <>
              {" "}
              <Link href={status.href} className={`font-semibold text-terracotta ${controlFocus}`}>
                View Meal Plan
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {open ? (
        <AddToMealPlanSheet
          recipeId={recipeId}
          recipeTitle={recipeTitle}
          defaultServings={defaultServings}
          onClose={() => {
            setOpen(false);
            queueMicrotask(() => triggerRef.current?.focus());
          }}
          onUnauthorized={() => {
            setOpen(false);
            openAuth();
          }}
          onSuccess={(planName, href) => {
            setOpen(false);
            setStatus({
              message: `Added to ${planName}`,
              href,
            });
            window.setTimeout(() => setStatus(null), 6000);
            queueMicrotask(() => triggerRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}

function AddToMealPlanSheet({
  recipeId,
  recipeTitle,
  defaultServings,
  onClose,
  onUnauthorized,
  onSuccess,
}: {
  recipeId: string;
  recipeTitle: string;
  defaultServings: number;
  onClose: () => void;
  onUnauthorized: () => void;
  onSuccess: (planName: string, href: string | null) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planId, setPlanId] = useState("");
  const [planDate, setPlanDate] = useState("");
  const [mealSlot, setMealSlot] = useState<MealSlot>(MEAL_PLAN_DEFAULT_SLOT);
  const [servings, setServings] = useState(
    Number.isFinite(defaultServings) ? Math.max(1, Math.min(99, Math.round(defaultServings))) : 4,
  );
  const [note, setNote] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const localToday = browserLocalTodayYmd();
      setToday(localToday);
      setPlanDate(localToday);

      void (async () => {
        const ensured = await ensureDefaultMealPlanAction();
        if (cancelled) return;
        if (!ensured.ok) {
          setLoading(false);
          if (ensured.error === "NOT_AUTHENTICATED" || ensured.error === "FEATURE_DISABLED") {
            onUnauthorized();
            onClose();
            return;
          }
          setError(ensured.message || mealPlanErrorMessage(ensured.error));
          return;
        }

        const listed = await listMealPlansAction();
        if (cancelled) return;
        setLoading(false);
        if (!listed.ok) {
          if (listed.error === "NOT_AUTHENTICATED" || listed.error === "FEATURE_DISABLED") {
            onUnauthorized();
            onClose();
            return;
          }
          setError(listed.message || mealPlanErrorMessage(listed.error));
          return;
        }

        setPlans(listed.data.plans);
        const preferred =
          listed.data.plans.find((plan) => plan.id === ensured.data.id) ?? listed.data.plans[0];
        if (preferred) setPlanId(preferred.id);
        queueMicrotask(() => {
          panelRef.current?.querySelector<HTMLElement>("select,input,button")?.focus();
        });
      })();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [onClose, onUnauthorized]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!planId || !today) return;
    const horizon = validateMealPlanDateHorizon(planDate, today);
    if (!horizon.ok) {
      setError(
        mealPlanErrorMessage(horizon.error === "OUT_OF_HORIZON" ? "DATE_OUT_OF_RANGE" : "INVALID_DATE"),
      );
      return;
    }

    setBusy(true);
    setError("");
    const result = await addMealPlanItemAction({
      planId,
      recipeId,
      planDate,
      mealSlot,
      plannedServings: servings,
      note: note.trim() || undefined,
      today,
    });
    setBusy(false);

    if (!result.ok) {
      if (result.error === "NOT_AUTHENTICATED" || result.error === "FEATURE_DISABLED") {
        onUnauthorized();
        onClose();
        return;
      }
      setError(result.message || mealPlanErrorMessage(result.error));
      return;
    }

    const planName = plans.find((plan) => plan.id === planId)?.name ?? "Meal Plan";
    onSuccess(planName, mealPlannerHrefForDate(planId, planDate));
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-sm border border-line bg-paper p-5 shadow-sm sm:rounded-sm"
      >
        <h2 id={titleId} className="font-serif text-2xl text-ink">
          Add to Meal Plan
        </h2>
        <p className="mt-1 text-sm text-muted">{recipeTitle}</p>

        {loading ? (
          <p className="mt-5 text-sm text-muted">Loading your plans…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="add-mp-plan" className="text-sm font-semibold text-ink">
                Plan
              </label>
              <select
                id="add-mp-plan"
                className={`${authInputClass} mt-1`}
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                disabled={busy || plans.length === 0}
                required
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-mp-date" className="text-sm font-semibold text-ink">
                  Date
                </label>
                <input
                  id="add-mp-date"
                  type="date"
                  className={`${authInputClass} mt-1`}
                  value={planDate}
                  onChange={(event) => setPlanDate(event.target.value)}
                  disabled={busy}
                  required
                />
              </div>
              <div>
                <label htmlFor="add-mp-slot" className="text-sm font-semibold text-ink">
                  Meal
                </label>
                <select
                  id="add-mp-slot"
                  className={`${authInputClass} mt-1`}
                  value={mealSlot}
                  onChange={(event) => setMealSlot(event.target.value as MealSlot)}
                  disabled={busy}
                >
                  {MEAL_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {MEAL_SLOT_LABELS[slot]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="add-mp-servings" className="text-sm font-semibold text-ink">
                Servings
              </label>
              <input
                id="add-mp-servings"
                type="number"
                min={1}
                max={99}
                className={`${authInputClass} mt-1`}
                value={servings}
                onChange={(event) => setServings(Number(event.target.value))}
                disabled={busy}
                required
              />
            </div>

            <div>
              <label htmlFor="add-mp-note" className="text-sm font-semibold text-ink">
                Planning note <span className="font-normal text-muted">(optional, private)</span>
              </label>
              <textarea
                id="add-mp-note"
                className={`${authInputClass} mt-1 min-h-[4rem]`}
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
              />
            </div>

            {error ? (
              <p id={errorId} className="text-sm text-terracotta" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button type="submit" className={DIALOG_PRIMARY} disabled={busy || !planId}>
                {busy ? "Adding…" : "Add to Meal Plan"}
              </button>
              <button
                type="button"
                className={DIALOG_SECONDARY}
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
