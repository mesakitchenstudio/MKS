"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Recipe } from "@/data/types";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import {
  CookingIngredientsList,
  CookingIngredientsSheet,
} from "@/components/cooking/CookingIngredientsPanel";
import { CookingTimersPanel } from "@/components/cooking/CookingTimersPanel";
import { useKeepScreenAwake } from "@/components/cooking/useKeepScreenAwake";
import { RecipeStepVideoTimestampLink } from "@/components/youtube/RecipeStepVideoTimestampLink";
import { VideoTimestampLink } from "@/components/youtube/VideoTimestampLink";
import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";
import {
  buildCookingNavModel,
  clampStepIndex,
  firstStepIndexForStage,
  stageProgressLabel,
} from "@/lib/cooking-nav";
import { clampRecipeServings } from "@/lib/culinary-format";
import {
  type CookingActiveTimer,
  type CookingSessionState,
  clearCookingSession,
  cookingContentVersion,
  createEmptyCookingSession,
  hasMeaningfulCookingProgress,
  readCookingSession,
  resolveCookingSession,
  timerRemainingMs,
  writeCookingSession,
} from "@/lib/cooking-session";
import type { StageVideoHelp } from "@/lib/recipe-stage-video-help";
import { isPublicStepVideoTimestampsEligible } from "@/lib/step-video-timestamps";
import { timestampForStep } from "@/lib/recipe-youtube";
import { formatTimestampInput } from "@/lib/youtube-metadata-editor";

export function CookingMode({
  recipe,
  recipeId,
  youtube = null,
  stageVideoHelp = {},
  initialServings,
  stepTimestampsEnabled = false,
}: {
  recipe: Recipe;
  recipeId: string;
  youtube?: ResolvedRecipeYoutube | null;
  stageVideoHelp?: Record<string, StageVideoHelp>;
  initialServings?: number;
  /** Roadmap #10 — server-derived gate; never NEXT_PUBLIC. */
  stepTimestampsEnabled?: boolean;
}) {
  const contentVersion = useMemo(() => cookingContentVersion(recipe), [recipe]);
  const nav = useMemo(() => buildCookingNavModel(recipe), [recipe]);
  const stepTimestampsEligible = useMemo(
    () =>
      isPublicStepVideoTimestampsEligible({
        gateEnabled: stepTimestampsEnabled,
        instructions: recipe.instructions,
        youtube: recipe.youtube,
        youtubeUrl: recipe.youtubeUrl,
      }),
    [stepTimestampsEnabled, recipe.instructions, recipe.youtube, recipe.youtubeUrl],
  );
  const video = useRecipeVideoOptional();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const ingredientsTitleId = useId();
  const stagesTitleId = useId();

  const [hydrated, setHydrated] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [session, setSession] = useState<CookingSessionState>(() =>
    createEmptyCookingSession({
      recipeId,
      contentVersion,
      servings: clampRecipeServings(initialServings ?? recipe.servings),
    }),
  );

  const keepAwake = useKeepScreenAwake(session.keepScreenAwake && hydrated && !finished);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readCookingSession(recipeId);
      const resolved = resolveCookingSession({
        recipeId,
        contentVersion,
        stored,
      });

      let next = createEmptyCookingSession({
        recipeId,
        contentVersion,
        servings: clampRecipeServings(initialServings ?? recipe.servings),
      });

      if (resolved.status === "ok") {
        next = {
          ...resolved.session,
          // Explicit ?servings= from the recipe page overrides; otherwise restore session.
          servings: clampRecipeServings(
            initialServings !== undefined ? initialServings : resolved.session.servings,
          ),
          currentStepIndex: clampStepIndex(resolved.session.currentStepIndex, nav.totalSteps),
        };
      } else if (resolved.status === "stale") {
        setStaleNotice(true);
        clearCookingSession(recipeId);
      }

      setSession(next);
      setHydrated(true);
      trackEvent("recipe_cook_mode_start", {
        recipe_slug: recipe.slug,
        recipe_title: recipe.title,
        recipe_id: recipeId,
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // Hydrate once from localStorage after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCookingSession(session);
  }, [session, hydrated]);

  // Tick timers to completion using wall-clock endsAt
  useEffect(() => {
    if (!hydrated || session.timers.length === 0) return;
    const id = window.setInterval(() => {
      setSession((prev) => {
        const now = Date.now();
        let changed = false;
        const timers = prev.timers.map((timer) => {
          if (timer.status !== "running") return timer;
          if (timerRemainingMs(timer, now) > 0) return timer;
          changed = true;
          return { ...timer, status: "completed" as const, endsAt: null, remainingMs: 0 };
        });
        return changed ? { ...prev, timers } : prev;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [hydrated, session.timers.length]);

  const currentIndex = clampStepIndex(session.currentStepIndex, nav.totalSteps);
  const current = nav.steps[currentIndex];
  const factor = session.servings / Math.max(1, recipe.servings);
  const checkedKeys = useMemo(
    () => new Set(session.checkedIngredientKeys),
    [session.checkedIngredientKeys],
  );
  const completedSet = useMemo(
    () => new Set(session.completedStepIndexes),
    [session.completedStepIndexes],
  );

  const announceStep = useCallback(() => {
    requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
    });
  }, []);

  const goToStep = useCallback(
    (index: number, opts?: { completePrevious?: boolean }) => {
      if (nav.totalSteps <= 0) return;
      const nextIndex = clampStepIndex(index, nav.totalSteps);
      setFinished(false);
      setSession((prev) => {
        const completed = new Set(prev.completedStepIndexes);
        if (opts?.completePrevious) {
          completed.add(prev.currentStepIndex);
        }
        return {
          ...prev,
          currentStepIndex: nextIndex,
          completedStepIndexes: [...completed],
        };
      });
      announceStep();
    },
    [announceStep, nav.totalSteps],
  );

  const goNext = useCallback(() => {
    if (!current) return;
    if (currentIndex >= nav.totalSteps - 1) {
      setSession((prev) => ({
        ...prev,
        completedStepIndexes: [...new Set([...prev.completedStepIndexes, prev.currentStepIndex])],
      }));
      setFinished(true);
      trackEvent("recipe_cook_mode_complete", {
        recipe_slug: recipe.slug,
        recipe_title: recipe.title,
        recipe_id: recipeId,
      });
      return;
    }
    goToStep(currentIndex + 1, { completePrevious: true });
  }, [current, currentIndex, goToStep, nav.totalSteps, recipe.slug, recipe.title, recipeId]);

  const goPrev = useCallback(() => {
    if (finished) {
      setFinished(false);
      announceStep();
      return;
    }
    if (currentIndex <= 0) return;
    goToStep(currentIndex - 1);
  }, [announceStep, currentIndex, finished, goToStep]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (ingredientsOpen || stagesOpen || confirmRestart) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
        if (target.closest('[role="dialog"]') || target.closest("video")) return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmRestart, goNext, goPrev, ingredientsOpen, stagesOpen]);

  function startOver() {
    if (hasMeaningfulCookingProgress(session) && !confirmRestart) {
      setConfirmRestart(true);
      return;
    }
    clearCookingSession(recipeId);
    setSession(
      createEmptyCookingSession({
        recipeId,
        contentVersion,
        servings: clampRecipeServings(recipe.servings),
      }),
    );
    setFinished(false);
    setConfirmRestart(false);
    setStaleNotice(false);
    announceStep();
  }

  function startStepTimer() {
    if (!current?.timerSeconds) return;
    const id = `timer-${Date.now()}-${current.globalIndex}`;
    const durationSeconds = current.timerSeconds;
    const timer: CookingActiveTimer = {
      id,
      label: current.stageName || `Step ${current.globalIndex + 1}`,
      durationSeconds,
      endsAt: Date.now() + durationSeconds * 1000,
      remainingMs: null,
      status: "running",
    };
    setSession((prev) => ({ ...prev, timers: [...prev.timers, timer] }));
  }

  function pauseTimer(id: string) {
    setSession((prev) => ({
      ...prev,
      timers: prev.timers.map((timer) => {
        if (timer.id !== id || timer.status !== "running") return timer;
        return {
          ...timer,
          status: "paused",
          remainingMs: timerRemainingMs(timer),
          endsAt: null,
        };
      }),
    }));
  }

  function resumeTimer(id: string) {
    setSession((prev) => ({
      ...prev,
      timers: prev.timers.map((timer) => {
        if (timer.id !== id || timer.status !== "paused") return timer;
        const remaining = timer.remainingMs ?? timer.durationSeconds * 1000;
        return {
          ...timer,
          status: "running",
          endsAt: Date.now() + remaining,
          remainingMs: null,
        };
      }),
    }));
  }

  function resetTimer(id: string) {
    setSession((prev) => ({
      ...prev,
      timers: prev.timers.map((timer) => {
        if (timer.id !== id) return timer;
        return {
          ...timer,
          status: "running",
          endsAt: Date.now() + timer.durationSeconds * 1000,
          remainingMs: null,
        };
      }),
    }));
  }

  function dismissTimer(id: string) {
    setSession((prev) => ({
      ...prev,
      timers: prev.timers.filter((timer) => timer.id !== id),
    }));
  }

  const recipePath = `/recipes/${recipe.slug}`;
  const progressPct =
    nav.totalSteps > 0 ? Math.round(((currentIndex + (finished ? 1 : 0)) / nav.totalSteps) * 100) : 0;
  const stageHelp = current ? stageVideoHelp[current.stageId] : undefined;
  const stepTs10 =
    stepTimestampsEligible && current && current.videoTimestampSeconds != null
      ? current.videoTimestampSeconds
      : null;
  const legacyStepTs =
    stepTs10 == null && current && youtube
      ? timestampForStep(youtube.timestamps, current.globalIndex)
      : undefined;
  // Legacy XOR: per-step legacy hides stage help. Active #10 may coexist with stage help.
  const showStageHelpLink = Boolean(stageHelp && youtube && (stepTs10 != null || !legacyStepTs));

  if (nav.totalSteps === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-ink">This recipe doesn&apos;t have cooking steps yet.</p>
        <Link href={recipePath} className="mt-4 inline-block font-semibold text-terracotta hover:underline">
          Back to recipe
        </Link>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-[70vh] bg-gradient-to-b from-cream to-paper">
        <CookingHeader recipeTitle={recipe.title} recipePath={recipePath} />
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">You&apos;re done</p>
          <h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl text-ink sm:text-4xl">
            {recipe.title}
          </h1>
          <p className="mt-4 text-muted">
            All {nav.totalSteps} step{nav.totalSteps === 1 ? "" : "s"} completed.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={recipePath}
              className="min-h-11 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
            >
              Back to recipe
            </Link>
            <button
              type="button"
              onClick={() => {
                setFinished(false);
                announceStep();
              }}
              className="min-h-11 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-cream"
            >
              Review steps
            </button>
            <button
              type="button"
              onClick={startOver}
              className="min-h-11 text-sm font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline"
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ingredientsList = (
    <CookingIngredientsList
      groups={recipe.ingredients}
      factor={factor}
      servings={session.servings}
      servingsUnit={recipe.servingsUnit}
      baseServings={recipe.servings}
      checkedKeys={checkedKeys}
      onToggle={(key) => {
        setSession((prev) => {
          const set = new Set(prev.checkedIngredientKeys);
          if (set.has(key)) set.delete(key);
          else set.add(key);
          return { ...prev, checkedIngredientKeys: [...set] };
        });
      }}
      onServingsChange={(next) => {
        setSession((prev) => ({ ...prev, servings: clampRecipeServings(next) }));
        trackEvent("recipe_servings_change", {
          recipe_slug: recipe.slug,
          recipe_title: recipe.title,
          servings: clampRecipeServings(next),
          source: "cooking_mode",
        });
      }}
    />
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-cream via-paper to-sand/40">
      <CookingHeader recipeTitle={recipe.title} recipePath={recipePath} />

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-28 pt-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-12 lg:pt-6">
        <div className="min-w-0 space-y-6">
          {staleNotice ? (
            <p
              role="status"
              className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-ink"
            >
              The recipe has been updated since this cooking session started. Starting fresh.
            </p>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {current ? stageProgressLabel(current, nav.totalStages) : null}
            </p>
            <p className="mt-1 font-[family-name:var(--font-fraunces)] text-xl text-ink sm:text-2xl">
              {current?.stageName}
            </p>
            <div
              className="mt-4 h-1.5 overflow-hidden rounded-full bg-line/80"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              aria-label={`Cooking progress: step ${currentIndex + 1} of ${nav.totalSteps}`}
            >
              <div
                className="h-full rounded-full bg-terracotta transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-muted">
              Step {currentIndex + 1} of {nav.totalSteps}
              {nav.totalStages > 1
                ? ` · ${completedSet.size} completed`
                : null}
            </p>
          </div>

          <section aria-labelledby="cooking-step-heading" className="space-y-4">
            <h2
              id="cooking-step-heading"
              ref={stepHeadingRef}
              tabIndex={-1}
              className="break-words font-[family-name:var(--font-fraunces)] text-2xl leading-snug text-ink outline-none sm:text-3xl"
            >
              {current?.text}
            </h2>

            <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-3">
              {stepTs10 != null && youtube ? (
                <RecipeStepVideoTimestampLink
                  seconds={stepTs10}
                  videoId={youtube.videoId}
                  recipeSlug={recipe.slug}
                  recipeName={recipe.title}
                  videoTitle={youtube.title}
                  stepNumber={currentIndex + 1}
                  scroll={false}
                />
              ) : null}
              {legacyStepTs && youtube ? (
                <VideoTimestampLink
                  label={`Watch this step · ${formatTimestampInput(legacyStepTs.time)}`}
                  time={legacyStepTs.time}
                  videoId={youtube.videoId}
                  recipeSlug={recipe.slug}
                  recipeName={recipe.title}
                  videoTitle={youtube.title}
                />
              ) : null}
              {showStageHelpLink && stageHelp && youtube ? (
                <VideoTimestampLink
                  label={`Watch this stage · ${formatTimestampInput(stageHelp.time)}`}
                  time={stageHelp.time}
                  videoId={youtube.videoId}
                  recipeSlug={recipe.slug}
                  recipeName={recipe.title}
                  videoTitle={youtube.title}
                />
              ) : null}
              {youtube && video ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-olive underline-offset-2 hover:underline"
                  onClick={(event) => {
                    video.expandWatchMethod({
                      source: "cooking_mode_full",
                      scroll: false,
                      trigger: event.currentTarget,
                    });
                  }}
                >
                  Watch the full method
                </button>
              ) : null}
            </div>

            <CookingTimersPanel
              timers={session.timers}
              currentStepTimerSeconds={current?.timerSeconds}
              currentStepLabel={current?.stageName ?? "Step"}
              onStartStepTimer={startStepTimer}
              onPause={pauseTimer}
              onResume={resumeTimer}
              onReset={resetTimer}
              onDismiss={dismissTimer}
            />
          </section>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="min-h-11 min-w-[6.5rem] rounded-full border border-line px-4 text-sm font-semibold text-ink enabled:hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              className="min-h-11 min-w-[6.5rem] rounded-full bg-terracotta px-4 text-sm font-semibold text-paper hover:bg-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              {currentIndex >= nav.totalSteps - 1 ? "Finish cooking" : "Next"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line/70 pt-4 lg:hidden">
            <button
              type="button"
              onClick={() => setIngredientsOpen(true)}
              className="min-h-11 rounded-full border border-olive px-4 text-sm font-semibold text-olive hover:bg-olive/5"
            >
              View ingredients
            </button>
            {nav.totalStages > 1 ? (
              <button
                type="button"
                onClick={() => setStagesOpen(true)}
                className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:bg-cream"
              >
                Stages
              </button>
            ) : null}
            <button
              type="button"
              onClick={startOver}
              className="min-h-11 text-sm font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline"
            >
              Start over
            </button>
          </div>
        </div>

        <aside className="hidden space-y-6 lg:block" aria-label="Cooking support">
          {ingredientsList}
          {nav.totalStages > 1 ? (
            <StagesList
              nav={nav}
              currentStageId={current?.stageId}
              completedSet={completedSet}
              onJump={(stageId) => {
                goToStep(firstStepIndexForStage(nav, stageId));
              }}
            />
          ) : null}
          <WakeLockControl
            supported={keepAwake.supported}
            enabled={session.keepScreenAwake}
            message={keepAwake.unavailableMessage}
            onChange={(enabled) => setSession((prev) => ({ ...prev, keepScreenAwake: enabled }))}
          />
          <button
            type="button"
            onClick={startOver}
            className="text-sm font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline"
          >
            Start over
          </button>
        </aside>
      </div>

      {/* Mobile sticky support strip */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <WakeLockControl
            supported={keepAwake.supported}
            enabled={session.keepScreenAwake}
            message={keepAwake.unavailableMessage}
            onChange={(enabled) => setSession((prev) => ({ ...prev, keepScreenAwake: enabled }))}
            compact
          />
          <button
            type="button"
            onClick={() => setIngredientsOpen(true)}
            className="min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-ink"
          >
            Ingredients
          </button>
        </div>
      </div>

      <CookingIngredientsSheet
        open={ingredientsOpen}
        onClose={() => setIngredientsOpen(false)}
        titleId={ingredientsTitleId}
      >
        {ingredientsList}
      </CookingIngredientsSheet>

      {stagesOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close stages"
            onClick={() => setStagesOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={stagesTitleId}
            className="relative z-10 max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-paper p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id={stagesTitleId} className="font-[family-name:var(--font-fraunces)] text-lg">
                Stages
              </h2>
              <button
                type="button"
                className="min-h-10 px-2 text-sm font-semibold text-muted"
                onClick={() => setStagesOpen(false)}
              >
                Close
              </button>
            </div>
            <StagesList
              nav={nav}
              currentStageId={current?.stageId}
              completedSet={completedSet}
              onJump={(stageId) => {
                setStagesOpen(false);
                goToStep(firstStepIndexForStage(nav, stageId));
              }}
            />
          </div>
        </div>
      ) : null}

      {confirmRestart ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Cancel start over"
            onClick={() => setConfirmRestart(false)}
          />
          <div
            role="alertdialog"
            aria-labelledby="restart-title"
            aria-describedby="restart-desc"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-paper p-5 shadow-lg"
          >
            <h2 id="restart-title" className="font-[family-name:var(--font-fraunces)] text-xl text-ink">
              Start over?
            </h2>
            <p id="restart-desc" className="mt-2 text-sm text-muted">
              This clears your cooking progress for this recipe on this device.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-10 rounded-full px-4 text-sm font-semibold text-muted"
                onClick={() => setConfirmRestart(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-10 rounded-full bg-terracotta px-4 text-sm font-semibold text-paper"
                onClick={startOver}
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CookingHeader({ recipeTitle, recipePath }: { recipeTitle: string; recipePath: string }) {
  return (
    <header className="border-b border-line/80 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-fraunces)] text-sm font-semibold text-terracotta">
            {site.shortName || "Mesa"}
          </p>
          <p className="truncate text-sm text-muted" title={recipeTitle}>
            {recipeTitle}
          </p>
        </div>
        <Link
          href={recipePath}
          className="shrink-0 min-h-10 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Exit
        </Link>
      </div>
    </header>
  );
}

function StagesList({
  nav,
  currentStageId,
  completedSet,
  onJump,
}: {
  nav: ReturnType<typeof buildCookingNavModel>;
  currentStageId?: string;
  completedSet: Set<number>;
  onJump: (stageId: string) => void;
}) {
  return (
    <nav aria-label="Stages">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Stages</h2>
      <ol className="space-y-1">
        {nav.stages.map((stage) => {
          const stageSteps = stage.steps;
          const allDone = stageSteps.every((s) => completedSet.has(s.globalIndex));
          const isCurrent = stage.id === currentStageId;
          const marker = allDone ? "✓" : isCurrent ? "●" : "○";
          return (
            <li key={stage.id}>
              <button
                type="button"
                onClick={() => onJump(stage.id)}
                className={`flex w-full min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${
                  isCurrent ? "bg-cream font-semibold text-ink" : "text-ink hover:bg-cream/70"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="w-4 shrink-0 text-center text-terracotta" aria-hidden>
                  {marker}
                </span>
                <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                <span className="sr-only">
                  {allDone ? "Completed" : isCurrent ? "Current stage" : "Not started"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function WakeLockControl({
  supported,
  enabled,
  message,
  onChange,
  compact = false,
}: {
  supported: boolean;
  enabled: boolean;
  message: string | null;
  onChange: (enabled: boolean) => void;
  compact?: boolean;
}) {
  if (!supported) {
    return compact ? null : (
      <p className="text-xs text-muted">Screen awake isn&apos;t available in this browser.</p>
    );
  }
  return (
    <div className={compact ? "" : "space-y-1"}>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-[var(--terracotta)]"
        />
        Keep screen awake
      </label>
      {!compact && message ? <p className="text-xs text-muted">{message}</p> : null}
    </div>
  );
}
