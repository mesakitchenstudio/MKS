"use client";

import { useEffect, useState } from "react";
import {
  formatTimerClock,
  formatTimerDurationLabel,
} from "@/lib/instruction-step";
import {
  type CookingActiveTimer,
  timerRemainingMs,
} from "@/lib/cooking-session";

export function CookingTimersPanel({
  timers,
  currentStepTimerSeconds,
  currentStepLabel,
  onStartStepTimer,
  onPause,
  onResume,
  onReset,
  onDismiss,
}: {
  timers: CookingActiveTimer[];
  currentStepTimerSeconds?: number;
  currentStepLabel: string;
  onStartStepTimer: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onReset: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const now = useNow(250);
  const hasStepTimer = currentStepTimerSeconds != null && currentStepTimerSeconds > 0;
  const activeCount = timers.filter((t) => t.status === "running" || t.status === "paused").length;

  if (!hasStepTimer && timers.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Timers">
      {hasStepTimer ? (
        <div className="rounded-xl border border-line bg-cream/60 p-3">
          <p className="text-sm font-semibold text-ink">
            {formatTimerDurationLabel(currentStepTimerSeconds!)} timer
            {currentStepLabel ? (
              <span className="sr-only"> for {currentStepLabel}</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={onStartStepTimer}
            className="mt-2 min-h-11 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Start timer
          </button>
        </div>
      ) : null}

      {timers.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Timers</h2>
          <ul className="space-y-2">
            {timers.map((timer) => {
              const remaining = timerRemainingMs(timer, now);
              const completed = timer.status === "completed" || remaining === 0;
              return (
                <li
                  key={timer.id}
                  className={`rounded-xl border px-3 py-2.5 ${
                    completed ? "border-terracotta/40 bg-terracotta/5" : "border-line bg-paper"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-ink">{timer.label}</p>
                    <p
                      className="shrink-0 font-mono text-base tabular-nums text-ink"
                      aria-live={completed ? "assertive" : "off"}
                    >
                      {completed ? "Done" : formatTimerClock(Math.ceil(remaining / 1000))}
                    </p>
                  </div>
                  {completed ? (
                    <p className="sr-only" role="status">
                      Timer finished for {timer.label}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!completed && timer.status === "running" ? (
                      <button
                        type="button"
                        className="min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                        onClick={() => onPause(timer.id)}
                        aria-label={`Pause timer ${timer.label}`}
                      >
                        Pause
                      </button>
                    ) : null}
                    {!completed && timer.status === "paused" ? (
                      <button
                        type="button"
                        className="min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                        onClick={() => onResume(timer.id)}
                        aria-label={`Resume timer ${timer.label}`}
                      >
                        Resume
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                      onClick={() => onReset(timer.id)}
                      aria-label={`Reset timer ${timer.label}`}
                    >
                      Reset
                    </button>
                    {completed ? (
                      <button
                        type="button"
                        className="min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-muted hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                        onClick={() => onDismiss(timer.id)}
                        aria-label={`Dismiss completed timer ${timer.label}`}
                      >
                        Dismiss
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {activeCount > 1 ? (
            <p className="text-xs text-muted">Multiple timers can run while stages overlap.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// re-export for tests / callers
export { formatTimerClock, formatTimerDurationLabel };
