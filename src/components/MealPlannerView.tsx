"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  addMealPlanItemAction,
  copyMealPlanItemAction,
  createMealPlanAction,
  deleteMealPlanAndSelectNextAction,
  deleteMealPlanItemAction,
  moveMealPlanItemAction,
  moveMealPlanItemInSlotAction,
  prepareMealPlanShoppingAction,
  renameMealPlanAction,
  updateMealPlanItemAction,
} from "@/app/profile/meal-plan-actions";
import { RecipeImage } from "@/components/RecipeImage";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  browserLocalTodayYmd,
  formatMealPlanDayHeading,
  formatMealPlanDayStripLabel,
  formatMealPlanWeekRangeLabel,
  isDateInMealPlanWeek,
  mealPlanErrorMessage,
  nextMealPlanWeekStart,
  previousMealPlanWeekStart,
  startOfWeekMonday,
  validateMealPlanDateHorizon,
  type MealPlanItemView,
  type MealPlannerRecipeOption,
  type MealSlot,
} from "@/lib/meal-planner";
import type { MealPlanShoppingPrepareData } from "@/lib/meal-planner-shopping";
import {
  commitMealPlanShoppingBatch,
  findMealPlanShoppingCollisions,
} from "@/lib/meal-planner-shopping-client";
import { SHOPPING_LIST_PATH } from "@/lib/shopping-list";
import { normalizeSearchText } from "@/lib/recipe-utils";

const DIALOG_PRIMARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";
const DIALOG_SECONDARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";
const ICON_BTN =
  `inline-flex h-9 items-center justify-center rounded-full border border-line bg-paper px-3 text-xs font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40 ${authFocusRing}`;

type PlanOption = { id: string; name: string };

type AddPrefill = { planDate: string; mealSlot: MealSlot };

export function MealPlannerView({
  planId,
  planName,
  plans,
  weekStart,
  items,
  recipeOptions,
  imageBySlug,
  shoppingListEnabled = false,
}: {
  planId: string;
  planName: string;
  plans: PlanOption[];
  weekStart: string;
  items: MealPlanItemView[];
  recipeOptions: MealPlannerRecipeOption[];
  imageBySlug: Record<string, { image: string; imageAlt: string }>;
  shoppingListEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [today, setToday] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(weekStart);
  const [error, setError] = useState<string | null>(null);
  const [shoppingStatus, setShoppingStatus] = useState<string | null>(null);
  const [shoppingPreparing, setShoppingPreparing] = useState(false);
  const [shoppingConfirm, setShoppingConfirm] = useState<{
    data: MealPlanShoppingPrepareData;
    collisions: number;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<AddPrefill | null>(null);
  const [editItem, setEditItem] = useState<MealPlanItemView | null>(null);
  const [moveItem, setMoveItem] = useState<MealPlanItemView | null>(null);
  const [copyItem, setCopyItem] = useState<MealPlanItemView | null>(null);

  const weekDays = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(`${weekStart}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      days.push(`${y}-${m}-${day}`);
    }
    return days;
  }, [weekStart]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const localToday = browserLocalTodayYmd();
      setToday(localToday);
      setSelectedDay(isDateInMealPlanWeek(localToday, weekStart) ? localToday : weekStart);
    });
    return () => cancelAnimationFrame(frame);
  }, [weekStart]);

  const itemsByDateSlot = useMemo(() => {
    const map = new Map<string, MealPlanItemView[]>();
    for (const item of items) {
      const key = `${item.planDate}|${item.mealSlot}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id < b.id ? -1 : 1;
      });
    }
    return map;
  }, [items]);

  function weekHref(nextWeek: string) {
    return `/profile/meal-planner/${planId}?week=${nextWeek}`;
  }

  function goWeek(nextWeek: string | null) {
    if (!nextWeek || !today) return;
    const horizon = validateMealPlanDateHorizon(nextWeek, today);
    if (!horizon.ok) {
      setError(mealPlanErrorMessage(horizon.error === "OUT_OF_HORIZON" ? "DATE_OUT_OF_RANGE" : "INVALID_DATE"));
      return;
    }
    setError(null);
    router.push(weekHref(nextWeek));
  }

  function goToday() {
    if (!today) return;
    const monday = startOfWeekMonday(today);
    if (!monday) return;
    setSelectedDay(today);
    router.push(weekHref(monday));
  }

  const itemCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.planDate, (map.get(item.planDate) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const weekHasItems = items.length > 0;
  const selectedDayHasItems = (itemCountByDate.get(selectedDay) ?? 0) > 0;

  async function prepareShopping(scope: "day" | "week", date?: string) {
    if (!shoppingListEnabled || !today) return;
    setError(null);
    setShoppingStatus(null);
    setShoppingPreparing(true);
    try {
      const result = await prepareMealPlanShoppingAction({
        planId,
        scope,
        date: scope === "day" ? date : undefined,
        weekStart: scope === "week" ? weekStart : undefined,
        today,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const collisions = findMealPlanShoppingCollisions(result.data.recipes);
      setShoppingConfirm({ data: result.data, collisions: collisions.length });
    } catch {
      setError("Could not prepare Shopping List items. Please try again.");
    } finally {
      setShoppingPreparing(false);
    }
  }

  function commitShopping() {
    if (!shoppingConfirm) return;
    const { data } = shoppingConfirm;
    setShoppingConfirm(null);
    const batch = commitMealPlanShoppingBatch(data.recipes);
    let message = batch.message;
    if (data.skippedUnavailable > 0) {
      message +=
        data.skippedUnavailable === 1
          ? " 1 unavailable meal was skipped."
          : ` ${data.skippedUnavailable} unavailable meals were skipped.`;
    }
    if (batch.ok) {
      setShoppingStatus(message);
      setError(null);
    } else {
      setError(message);
      setShoppingStatus(null);
    }
  }

  const prevWeek = previousMealPlanWeekStart(weekStart);
  const nextWeek = nextMealPlanWeekStart(weekStart);
  const prevDisabled =
    !today || !prevWeek || !validateMealPlanDateHorizon(prevWeek, today).ok;
  const nextDisabled =
    !today || !nextWeek || !validateMealPlanDateHorizon(nextWeek, today).ok;
  const weekLabel = formatMealPlanWeekRangeLabel(weekStart) ?? weekStart;
  const selectedHeading = formatMealPlanDayHeading(selectedDay) ?? selectedDay;

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await action();
          router.refresh();
        } catch {
          setError("Something went wrong. Please try again.");
        }
      })();
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/profile" className={`font-semibold text-terracotta ${authFocusRing} rounded-sm`}>
          Profile
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-ink">Meal Planner</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            Meal Planner
          </p>
          <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">{planName}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Plan breakfast through snack for the week. Private to your account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="meal-plan-select">
            Meal plan
          </label>
          <select
            id="meal-plan-select"
            className={`${authInputClass} h-11 min-w-[10rem]`}
            value={planId}
            disabled={pending}
            onChange={(event) => {
              router.push(`/profile/meal-planner/${event.target.value}?week=${weekStart}`);
            }}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={ICON_BTN}
            disabled={pending}
            onClick={() => setCreateOpen(true)}
          >
            New plan
          </button>
          <button
            type="button"
            className={ICON_BTN}
            disabled={pending}
            onClick={() => setRenameOpen(true)}
          >
            Rename
          </button>
          <button
            type="button"
            className={`${ICON_BTN} text-terracotta`}
            disabled={pending}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </button>
        </div>
      </header>

      {error ? (
        <p className="mt-4 rounded-sm border border-terracotta/30 bg-sand/50 px-3 py-2 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}

      {shoppingStatus ? (
        <p
          className="mt-4 rounded-sm border border-olive/30 bg-sand/40 px-3 py-2 text-sm text-ink"
          role="status"
          aria-live="polite"
        >
          {shoppingStatus}{" "}
          <Link
            href={SHOPPING_LIST_PATH}
            className={`font-semibold text-terracotta ${authFocusRing} rounded-sm`}
          >
            View Shopping List
          </Link>
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
        <button
          type="button"
          className={ICON_BTN}
          disabled={pending || prevDisabled}
          onClick={() => goWeek(prevWeek)}
          aria-label="Previous week"
        >
          ‹ Previous
        </button>
        <div className="text-center">
          <p className="font-serif text-xl text-ink md:text-2xl">{weekLabel}</p>
          <button
            type="button"
            className={`mt-1 text-sm font-semibold text-terracotta ${authFocusRing} rounded-sm`}
            onClick={goToday}
            disabled={!today || pending}
          >
            Today
          </button>
          {shoppingListEnabled ? (
            <div className="mt-2">
              <button
                type="button"
                className={`${ICON_BTN} w-full sm:w-auto`}
                disabled={pending || shoppingPreparing || !weekHasItems || !today}
                onClick={() => void prepareShopping("week")}
                aria-label="Add this week to Shopping List"
              >
                {shoppingPreparing ? "Preparing…" : "Add week to Shopping List"}
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={ICON_BTN}
          disabled={pending || nextDisabled}
          onClick={() => goWeek(nextWeek)}
          aria-label="Next week"
        >
          Next ›
        </button>
      </div>

      {/* Mobile day strip */}
      <div className="mt-6 md:hidden">
        <div
          role="tablist"
          aria-label="Days of the week"
          className="flex gap-2 overflow-x-auto pb-2"
        >
          {weekDays.map((day) => {
            const label = formatMealPlanDayStripLabel(day);
            const selected = day === selectedDay;
            const isToday = today === day;
            return (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedDay(day)}
                className={`flex min-w-[3.5rem] flex-col items-center rounded-sm border px-2 py-2 text-center ${authFocusRing} ${
                  selected
                    ? "border-olive bg-sand/70 text-ink"
                    : "border-line bg-paper text-muted hover:bg-cream/80"
                }`}
              >
                <span className="text-[0.65rem] font-semibold uppercase tracking-wide">
                  {label?.weekday}
                </span>
                <span className="font-serif text-lg leading-none">{label?.day}</span>
                {isToday ? (
                  <span className="mt-1 text-[0.6rem] font-semibold uppercase text-olive">Today</span>
                ) : (
                  <span className="mt-1 text-[0.6rem] opacity-0">Today</span>
                )}
              </button>
            );
          })}
        </div>

        <section className="mt-5" aria-labelledby="selected-day-heading">
          <h2 id="selected-day-heading" className="font-serif text-2xl text-ink">
            {selectedHeading}
            {today === selectedDay ? (
              <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-wide text-olive">
                Today
              </span>
            ) : null}
          </h2>
          {shoppingListEnabled ? (
            <button
              type="button"
              className={`${ICON_BTN} mt-3`}
              disabled={pending || shoppingPreparing || !selectedDayHasItems || !today}
              onClick={() => void prepareShopping("day", selectedDay)}
              aria-label={`Add ${selectedHeading} to Shopping List`}
            >
              Add this day to Shopping List
            </button>
          ) : null}
          <DaySlots
            planDate={selectedDay}
            itemsByDateSlot={itemsByDateSlot}
            imageBySlug={imageBySlug}
            pending={pending}
            onAdd={(slot) => setAddPrefill({ planDate: selectedDay, mealSlot: slot })}
            onEdit={setEditItem}
            onMove={setMoveItem}
            onCopy={(item) => {
              if (item.recipeAvailability === "available") setCopyItem(item);
            }}
            onRemove={(item) =>
              run(async () => {
                const result = await deleteMealPlanItemAction({ itemId: item.id, planId });
                if (!result.ok) setError(result.message || mealPlanErrorMessage(result.error));
              })
            }
            onReorder={(item, direction) =>
              run(async () => {
                const result = await moveMealPlanItemInSlotAction({
                  itemId: item.id,
                  planId,
                  direction,
                });
                if (!result.ok) setError(result.message || mealPlanErrorMessage(result.error));
              })
            }
          />
        </section>
      </div>

      {/* Desktop week columns */}
      <div className="mt-8 hidden gap-4 md:grid md:grid-cols-7">
        {weekDays.map((day) => {
          const label = formatMealPlanDayStripLabel(day);
          const isToday = today === day;
          const dayHasItems = (itemCountByDate.get(day) ?? 0) > 0;
          const dayHeading = formatMealPlanDayHeading(day) ?? day;
          return (
            <section key={day} className="min-w-0" aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="border-b border-line pb-2">
                <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-olive">
                  {label?.weekday}
                  {isToday ? " · Today" : ""}
                </span>
                <span className="font-serif text-2xl text-ink">{label?.day}</span>
              </h2>
              {shoppingListEnabled ? (
                <button
                  type="button"
                  className={`mt-2 w-full text-left text-[0.7rem] font-semibold leading-snug text-terracotta hover:text-terracotta-dark disabled:cursor-not-allowed disabled:opacity-40 ${authFocusRing} rounded-sm`}
                  disabled={pending || shoppingPreparing || !dayHasItems || !today}
                  onClick={() => void prepareShopping("day", day)}
                  aria-label={`Add ${dayHeading} to Shopping List`}
                >
                  Add day to Shopping List
                </button>
              ) : null}
              <DaySlots
                planDate={day}
                itemsByDateSlot={itemsByDateSlot}
                imageBySlug={imageBySlug}
                pending={pending}
                compact
                onAdd={(slot) => setAddPrefill({ planDate: day, mealSlot: slot })}
                onEdit={setEditItem}
                onMove={setMoveItem}
                onCopy={(item) => {
                  if (item.recipeAvailability === "available") setCopyItem(item);
                }}
                onRemove={(item) =>
                  run(async () => {
                    const result = await deleteMealPlanItemAction({ itemId: item.id, planId });
                    if (!result.ok) setError(result.message || mealPlanErrorMessage(result.error));
                  })
                }
                onReorder={(item, direction) =>
                  run(async () => {
                    const result = await moveMealPlanItemInSlotAction({
                      itemId: item.id,
                      planId,
                      direction,
                    });
                    if (!result.ok) setError(result.message || mealPlanErrorMessage(result.error));
                  })
                }
              />
            </section>
          );
        })}
      </div>

      {createOpen ? (
        <NameDialog
          title="New meal plan"
          confirmLabel="Create"
          initialName=""
          busy={pending}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (name) => {
            const result = await createMealPlanAction(name);
            if (!result.ok) return result.message || mealPlanErrorMessage(result.error);
            router.push(`/profile/meal-planner/${result.data.id}?week=${weekStart}`);
            return null;
          }}
        />
      ) : null}

      {shoppingConfirm ? (
        <ShoppingConfirmDialog
          data={shoppingConfirm.data}
          collisionCount={shoppingConfirm.collisions}
          busy={pending || shoppingPreparing}
          onClose={() => setShoppingConfirm(null)}
          onConfirm={commitShopping}
        />
      ) : null}

      {renameOpen ? (
        <NameDialog
          title="Rename meal plan"
          confirmLabel="Save"
          initialName={planName}
          busy={pending}
          onClose={() => setRenameOpen(false)}
          onSubmit={async (name) => {
            const result = await renameMealPlanAction(planId, name);
            if (!result.ok) return result.message || mealPlanErrorMessage(result.error);
            router.refresh();
            return null;
          }}
        />
      ) : null}

      {deleteOpen ? (
        <ConfirmDialog
          title="Delete meal plan?"
          body={`Delete “${planName}”? Planned meals in this plan will be removed.`}
          confirmLabel="Delete plan"
          busy={pending}
          danger
          onClose={() => setDeleteOpen(false)}
          onConfirm={() =>
            run(async () => {
              const result = await deleteMealPlanAndSelectNextAction(planId);
              if (!result.ok) {
                setError(result.message || mealPlanErrorMessage(result.error));
                return;
              }
              setDeleteOpen(false);
              router.push(`/profile/meal-planner/${result.data.id}?week=${weekStart}`);
            })
          }
        />
      ) : null}

      {addPrefill && today ? (
        <AddMealDialog
          prefill={addPrefill}
          recipes={recipeOptions}
          today={today}
          busy={pending}
          onClose={() => setAddPrefill(null)}
          onSubmit={(payload) =>
            run(async () => {
              const result = await addMealPlanItemAction({
                planId,
                ...payload,
                today,
              });
              if (!result.ok) {
                setError(result.message || mealPlanErrorMessage(result.error));
                return;
              }
              setAddPrefill(null);
            })
          }
        />
      ) : null}

      {editItem && today ? (
        <ItemFieldsDialog
          title="Edit meal"
          confirmLabel="Save"
          initialDate={editItem.planDate}
          initialSlot={editItem.mealSlot}
          initialServings={editItem.plannedServings}
          initialNote={editItem.note ?? ""}
          today={today}
          busy={pending}
          onClose={() => setEditItem(null)}
          onSubmit={(fields) =>
            run(async () => {
              const result = await updateMealPlanItemAction({
                itemId: editItem.id,
                planId,
                ...fields,
                today,
              });
              if (!result.ok) {
                setError(result.message || mealPlanErrorMessage(result.error));
                return;
              }
              setEditItem(null);
            })
          }
        />
      ) : null}

      {moveItem && today ? (
        <ItemFieldsDialog
          title="Move meal"
          confirmLabel="Move"
          initialDate={moveItem.planDate}
          initialSlot={moveItem.mealSlot}
          hideServings
          hideNote
          today={today}
          busy={pending}
          onClose={() => setMoveItem(null)}
          onSubmit={(fields) =>
            run(async () => {
              const result = await moveMealPlanItemAction({
                itemId: moveItem.id,
                planId,
                planDate: fields.planDate!,
                mealSlot: fields.mealSlot!,
                today,
              });
              if (!result.ok) {
                setError(result.message || mealPlanErrorMessage(result.error));
                return;
              }
              setMoveItem(null);
            })
          }
        />
      ) : null}

      {copyItem && today ? (
        <ItemFieldsDialog
          title="Copy meal"
          confirmLabel="Copy"
          initialDate={copyItem.planDate}
          initialSlot={copyItem.mealSlot}
          hideServings
          hideNote
          today={today}
          busy={pending}
          onClose={() => setCopyItem(null)}
          onSubmit={(fields) =>
            run(async () => {
              const result = await copyMealPlanItemAction({
                itemId: copyItem.id,
                planId,
                planDate: fields.planDate!,
                mealSlot: fields.mealSlot!,
                today,
              });
              if (!result.ok) {
                setError(result.message || mealPlanErrorMessage(result.error));
                return;
              }
              setCopyItem(null);
            })
          }
        />
      ) : null}
    </div>
  );
}

function DaySlots({
  planDate,
  itemsByDateSlot,
  imageBySlug,
  pending,
  compact = false,
  onAdd,
  onEdit,
  onMove,
  onCopy,
  onRemove,
  onReorder,
}: {
  planDate: string;
  itemsByDateSlot: Map<string, MealPlanItemView[]>;
  imageBySlug: Record<string, { image: string; imageAlt: string }>;
  pending: boolean;
  compact?: boolean;
  onAdd: (slot: MealSlot) => void;
  onEdit: (item: MealPlanItemView) => void;
  onMove: (item: MealPlanItemView) => void;
  onCopy: (item: MealPlanItemView) => void;
  onRemove: (item: MealPlanItemView) => void;
  onReorder: (item: MealPlanItemView, direction: "up" | "down") => void;
}) {
  return (
    <div className={compact ? "mt-3 space-y-4" : "mt-4 space-y-6"}>
      {MEAL_SLOTS.map((slot) => {
        const slotItems = itemsByDateSlot.get(`${planDate}|${slot}`) ?? [];
        return (
          <div key={slot}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className={`font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>
                {MEAL_SLOT_LABELS[slot]}
              </h3>
              <button
                type="button"
                className={`text-xs font-semibold text-terracotta ${authFocusRing} rounded-sm`}
                disabled={pending}
                onClick={() => onAdd(slot)}
              >
                + Add meal
              </button>
            </div>
            {slotItems.length === 0 ? (
              <p className={`mt-1 text-muted ${compact ? "text-[0.7rem]" : "text-sm"}`}>
                No meal planned.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {slotItems.map((item, index) => (
                  <MealItemCard
                    key={item.id}
                    item={item}
                    image={
                      item.recipeAvailability === "available"
                        ? imageBySlug[item.publicRecipeSlug ?? item.recipeSlug]
                        : undefined
                    }
                    compact={compact}
                    pending={pending}
                    isFirst={index === 0}
                    isLast={index === slotItems.length - 1}
                    onEdit={() => onEdit(item)}
                    onMove={() => onMove(item)}
                    onCopy={() => onCopy(item)}
                    onRemove={() => onRemove(item)}
                    onUp={() => onReorder(item, "up")}
                    onDown={() => onReorder(item, "down")}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MealItemCard({
  item,
  image,
  compact,
  pending,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onCopy,
  onRemove,
  onUp,
  onDown,
}: {
  item: MealPlanItemView;
  image?: { image: string; imageAlt: string };
  compact: boolean;
  pending: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const available = item.recipeAvailability === "available";
  const orphaned = item.recipeAvailability === "orphaned";
  const title = (
    <span className={`font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>
      {item.recipeTitle}
    </span>
  );

  return (
    <li className="rounded-sm border border-line bg-paper p-2">
      <div className="flex gap-2">
        {available && image ? (
          <div className={`relative shrink-0 overflow-hidden rounded-sm bg-sand ${compact ? "h-10 w-10" : "h-14 w-14"}`}>
            <RecipeImage src={image.image} alt={image.imageAlt} sizes="56px" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {available && item.publicRecipeSlug ? (
            <Link
              href={`/recipes/${item.publicRecipeSlug}`}
              className={`${authFocusRing} rounded-sm hover:text-terracotta`}
            >
              {title}
            </Link>
          ) : (
            <>
              {title}
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
                {orphaned ? "Recipe no longer available" : "Unavailable"}
                <span className="sr-only">
                  {orphaned
                    ? `. Historical title ${item.recipeTitle}.`
                    : `. This recipe is not currently published.`}
                </span>
              </p>
            </>
          )}
          <p className={`text-muted ${compact ? "text-[0.7rem]" : "text-xs"}`}>
            Serves {item.plannedServings}
          </p>
          {item.note ? (
            <p className={`mt-0.5 text-muted ${compact ? "text-[0.7rem]" : "text-xs"}`}>
              {item.note}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className={ICON_BTN} disabled={pending} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={ICON_BTN} disabled={pending} onClick={onMove}>
          Move
        </button>
        {available ? (
          <button type="button" className={ICON_BTN} disabled={pending} onClick={onCopy}>
            Copy
          </button>
        ) : null}
        <button
          type="button"
          className={ICON_BTN}
          disabled={pending || isFirst}
          onClick={onUp}
          aria-label={`Move ${item.recipeTitle} up`}
        >
          Up
        </button>
        <button
          type="button"
          className={ICON_BTN}
          disabled={pending || isLast}
          onClick={onDown}
          aria-label={`Move ${item.recipeTitle} down`}
        >
          Down
        </button>
        <button
          type="button"
          className={`${ICON_BTN} text-terracotta`}
          disabled={pending}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function PortalDialog({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("input,button,select,textarea")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [busy, onClose]);

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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-sm border border-line bg-paper p-5 shadow-sm sm:rounded-sm"
      >
        <h2 id={titleId} className="font-serif text-2xl text-ink">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function NameDialog({
  title,
  confirmLabel,
  initialName,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  confirmLabel: string;
  initialName: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const message = await onSubmit(name);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

  return (
    <PortalDialog title={title} onClose={onClose} busy={busy || saving}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="meal-plan-name" className="text-sm font-semibold text-ink">
            Name
          </label>
          <input
            id="meal-plan-name"
            className={`${authInputClass} mt-1`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            disabled={busy || saving}
          />
        </div>
        {error ? (
          <p className="text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={DIALOG_PRIMARY} disabled={busy || saving}>
            {confirmLabel}
          </button>
          <button
            type="button"
            className={DIALOG_SECONDARY}
            disabled={busy || saving}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  danger,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <PortalDialog title={title} onClose={onClose} busy={busy}>
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={danger ? DIALOG_PRIMARY : DIALOG_PRIMARY}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className={DIALOG_SECONDARY} disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </PortalDialog>
  );
}

function ShoppingConfirmDialog({
  data,
  collisionCount,
  busy,
  onClose,
  onConfirm,
}: {
  data: MealPlanShoppingPrepareData;
  collisionCount: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title =
    data.scope === "week" ? "Add this week to Shopping List?" : "Add this day to Shopping List?";
  return (
    <PortalDialog title={title} onClose={onClose} busy={busy}>
      <ul className="space-y-1 text-sm text-muted">
        <li>
          {data.mealCount} meal{data.mealCount === 1 ? "" : "s"}
        </li>
        <li>
          {data.uniqueRecipeCount} unique recipe{data.uniqueRecipeCount === 1 ? "" : "s"}
        </li>
        <li>
          {data.totalPlannedServings} total planned serving
          {data.totalPlannedServings === 1 ? "" : "s"}
        </li>
        {data.skippedUnavailable > 0 ? (
          <li>
            {data.skippedUnavailable} unavailable meal
            {data.skippedUnavailable === 1 ? "" : "s"} will be skipped
          </li>
        ) : null}
        {collisionCount > 0 ? (
          <li role="status">
            {collisionCount === 1
              ? "1 existing recipe will be updated."
              : `${collisionCount} existing recipes will be updated.`}
          </li>
        ) : null}
      </ul>
      {collisionCount > 0 ? (
        <p className="mt-3 text-sm text-ink">
          Some recipes are already in your Shopping List. Adding this{" "}
          {data.scope === "week" ? "week" : "day"} will update them to the planned servings.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={DIALOG_PRIMARY} disabled={busy} onClick={onConfirm}>
          Add to Shopping List
        </button>
        <button type="button" className={DIALOG_SECONDARY} disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </PortalDialog>
  );
}

function AddMealDialog({
  prefill,
  recipes,
  today,
  busy,
  onClose,
  onSubmit,
}: {
  prefill: AddPrefill;
  recipes: MealPlannerRecipeOption[];
  today: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    recipeId: string;
    planDate: string;
    mealSlot: string;
    plannedServings: number;
    note?: string;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [planDate, setPlanDate] = useState(prefill.planDate);
  const [mealSlot, setMealSlot] = useState<MealSlot>(prefill.mealSlot);
  const [servings, setServings] = useState(4);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query);
    if (!needle) return recipes.slice(0, 40);
    return recipes
      .filter((recipe) => normalizeSearchText(recipe.title).includes(needle))
      .slice(0, 40);
  }, [query, recipes]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!recipeId) {
      setError("Choose a recipe.");
      return;
    }
    const horizon = validateMealPlanDateHorizon(planDate, today);
    if (!horizon.ok) {
      setError(
        mealPlanErrorMessage(horizon.error === "OUT_OF_HORIZON" ? "DATE_OUT_OF_RANGE" : "INVALID_DATE"),
      );
      return;
    }
    onSubmit({
      recipeId,
      planDate,
      mealSlot,
      plannedServings: servings,
      note: note.trim() || undefined,
    });
  }

  return (
    <PortalDialog title="Add meal" onClose={onClose} busy={busy}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="add-recipe-search" className="text-sm font-semibold text-ink">
            Recipe
          </label>
          <input
            id="add-recipe-search"
            className={`${authInputClass} mt-1`}
            placeholder="Search published recipes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={busy}
          />
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-sm border border-line p-1">
            {filtered.map((recipe) => {
              const active = recipe.id === recipeId;
              return (
                <li key={recipe.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm ${authFocusRing} ${
                      active ? "bg-sand/70 font-semibold" : "hover:bg-cream/80"
                    }`}
                    onClick={() => {
                      setRecipeId(recipe.id);
                      setServings(recipe.servings || 4);
                    }}
                    aria-pressed={active}
                  >
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-sm bg-sand">
                      <RecipeImage src={recipe.image} alt="" sizes="32px" />
                    </span>
                    <span className="min-w-0 truncate">{recipe.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-date" className="text-sm font-semibold text-ink">
              Date
            </label>
            <input
              id="add-date"
              type="date"
              className={`${authInputClass} mt-1`}
              value={planDate}
              onChange={(event) => setPlanDate(event.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div>
            <label htmlFor="add-slot" className="text-sm font-semibold text-ink">
              Meal
            </label>
            <select
              id="add-slot"
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
          <label htmlFor="add-servings" className="text-sm font-semibold text-ink">
            Servings
          </label>
          <input
            id="add-servings"
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
          <label htmlFor="add-note" className="text-sm font-semibold text-ink">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="add-note"
            className={`${authInputClass} mt-1 min-h-[4rem]`}
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
          />
        </div>
        {error ? (
          <p className="text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={DIALOG_PRIMARY} disabled={busy}>
            Add to plan
          </button>
          <button type="button" className={DIALOG_SECONDARY} disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}

function ItemFieldsDialog({
  title,
  confirmLabel,
  initialDate,
  initialSlot,
  initialServings,
  initialNote = "",
  hideServings,
  hideNote,
  today,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  confirmLabel: string;
  initialDate: string;
  initialSlot: MealSlot | string;
  initialServings?: number;
  initialNote?: string;
  hideServings?: boolean;
  hideNote?: boolean;
  today: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (fields: {
    planDate?: string;
    mealSlot?: string;
    plannedServings?: number;
    note?: string | null;
  }) => void;
}) {
  const [planDate, setPlanDate] = useState(initialDate);
  const [mealSlot, setMealSlot] = useState(String(initialSlot));
  const [servings, setServings] = useState(initialServings ?? 4);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const horizon = validateMealPlanDateHorizon(planDate, today);
    if (!horizon.ok) {
      setError(
        mealPlanErrorMessage(horizon.error === "OUT_OF_HORIZON" ? "DATE_OUT_OF_RANGE" : "INVALID_DATE"),
      );
      return;
    }
    onSubmit({
      planDate,
      mealSlot,
      ...(hideServings ? {} : { plannedServings: servings }),
      ...(hideNote ? {} : { note: note.trim() ? note.trim() : null }),
    });
  }

  return (
    <PortalDialog title={title} onClose={onClose} busy={busy}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="item-date" className="text-sm font-semibold text-ink">
              Date
            </label>
            <input
              id="item-date"
              type="date"
              className={`${authInputClass} mt-1`}
              value={planDate}
              onChange={(event) => setPlanDate(event.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div>
            <label htmlFor="item-slot" className="text-sm font-semibold text-ink">
              Meal
            </label>
            <select
              id="item-slot"
              className={`${authInputClass} mt-1`}
              value={mealSlot}
              onChange={(event) => setMealSlot(event.target.value)}
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
        {!hideServings ? (
          <div>
            <label htmlFor="item-servings" className="text-sm font-semibold text-ink">
              Servings
            </label>
            <input
              id="item-servings"
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
        ) : null}
        {!hideNote ? (
          <div>
            <label htmlFor="item-note" className="text-sm font-semibold text-ink">
              Note <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="item-note"
              className={`${authInputClass} mt-1 min-h-[4rem]`}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
            />
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={DIALOG_PRIMARY} disabled={busy}>
            {confirmLabel}
          </button>
          <button type="button" className={DIALOG_SECONDARY} disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}
