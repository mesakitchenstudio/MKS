"use client";

import Image from "next/image";
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
  type ReactNode,
} from "react";
import { syncYoutubeAction } from "@/app/admin/actions";
import {
  createYoutubeReleaseAction,
  skipYoutubeSlotAction,
  updateYoutubeReleaseAction,
} from "@/app/admin/youtube-release-actions";
import {
  adminDangerButtonClass,
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSelectClass,
  adminTertiaryButtonClass,
} from "@/lib/admin-ui";
import type {
  PlannerStreamRow,
  YoutubeReleasePlannerDashboard,
} from "@/lib/youtube-data/release-planner";

type Props = {
  planner: YoutubeReleasePlannerDashboard;
  canSync: boolean;
  canManageAnalytics: boolean;
};

type DialogMode =
  | { kind: "none" }
  | { kind: "detail"; row: PlannerStreamRow }
  | { kind: "add" }
  | { kind: "assign"; row: PlannerStreamRow }
  | { kind: "skip"; row: PlannerStreamRow };

const SKIP_PRESETS = ["Holiday", "Studio break", "Special schedule", "Custom"] as const;
const ISTANBUL_TZ = "Europe/Istanbul";

function studioUrl(videoId: string) {
  return `https://studio.youtube.com/video/${videoId}/edit`;
}

function statusLabel(status: PlannerStreamRow["status"]) {
  switch (status) {
    case "OPEN":
      return "Open";
    case "PLANNED":
      return "Planned";
    case "SCHEDULED":
      return "Scheduled";
    case "PUBLISHED":
      return "Published";
    case "SKIPPED":
      return "Skipped";
    case "BACKLOG":
      return "Backlog";
    default:
      return status;
  }
}

function videoTypeLabel(type: PlannerStreamRow["videoType"]) {
  switch (type) {
    case "LONG":
      return "Long";
    case "SHORT":
      return "Short";
    case "SPECIAL":
      return "Special";
    default:
      return "—";
  }
}

function localIdFromRow(row: PlannerStreamRow): string | null {
  if (row.source !== "local" || !row.id.startsWith("local:")) return null;
  return row.id.slice("local:".length);
}

function releaseInstant(row: PlannerStreamRow): Date | null {
  if (!row.releaseAt) return null;
  const value = row.releaseAt instanceof Date ? row.releaseAt : new Date(row.releaseAt);
  return Number.isNaN(value.getTime()) ? null : value;
}

function istanbulDateKey(date = new Date()): string {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return `${bag.year}-${bag.month}-${bag.day}`;
}

function thisWeekDateKeys(now = new Date()): { start: string; end: string } {
  const todayKey = istanbulDateKey(now);
  const [y, m, d] = todayKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: ISTANBUL_TZ,
    weekday: "short",
  }).format(probe);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const daysFromMonday = (map[weekday] ?? 1) === 0 ? 6 : (map[weekday] ?? 1) - 1;
  const monday = new Date(Date.UTC(y, m - 1, d - daysFromMonday));
  const sunday = new Date(Date.UTC(y, m - 1, d - daysFromMonday + 6));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`,
    end: `${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}`,
  };
}

function isDateKeyThisWeek(dateKey: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const { start, end } = thisWeekDateKeys(now);
  return dateKey >= start && dateKey <= end;
}

function monthHeaderLabel(label: string) {
  return label.toUpperCase();
}

function monthStatusStats(rows: PlannerStreamRow[]) {
  const order: PlannerStreamRow["status"][] = [
    "SCHEDULED",
    "PLANNED",
    "OPEN",
    "PUBLISHED",
    "SKIPPED",
  ];
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) || 0) + 1);
  }
  return order
    .filter((status) => (counts.get(status) || 0) > 0)
    .map((status) => `${counts.get(status)} ${statusLabel(status)}`)
    .join(" · ");
}

/** Treat datetime-local wall clock as Europe/Istanbul (UTC+3, no DST). */
function istanbulLocalToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const utc = Date.UTC(year, month - 1, day, hour - 3, minute, 0);
  return new Date(utc).toISOString();
}

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
}

function OverlayShell({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className: string;
  children: ReactNode;
}) {
  useEscapeClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function RowMeta({ row }: { row: PlannerStreamRow }) {
  return (
    <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
      <span>{statusLabel(row.status)}</span>
      {row.videoType !== "UNKNOWN" ? (
        <>
          <span className="mx-2 text-line" aria-hidden>
            ·
          </span>
          <span className="tracking-[0.12em]">{videoTypeLabel(row.videoType)}</span>
        </>
      ) : null}
    </p>
  );
}

function ReleaseThumb({ row, size = "md" }: { row: PlannerStreamRow; size?: "sm" | "md" }) {
  const width = size === "sm" ? "w-[5.5rem]" : "w-[7.5rem]";
  return (
    <div className={`relative aspect-video shrink-0 overflow-hidden rounded-sm bg-sand ${width}`}>
      {row.thumbnailUrl ? (
        <Image
          src={row.thumbnailUrl}
          alt=""
          fill
          className="object-cover"
          sizes={size === "sm" ? "88px" : "120px"}
          unoptimized
        />
      ) : null}
    </div>
  );
}

export function YoutubeSchedulePanel({ planner, canSync, canManageAnalytics }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState("");
  const [dialog, setDialog] = useState<DialogMode>({ kind: "none" });
  const titleId = useId();
  const closeDialog = () => setDialog({ kind: "none" });

  const currentMonthKey = useMemo(() => istanbulDateKey().slice(0, 7), []);
  const hasCalendar = planner.months.length > 0 || Boolean(planner.upNext);
  const showHardError = planner.status === "error" && !hasCalendar;
  const showOauthNotice = planner.status === "needs_oauth";
  const showEmpty = !showHardError && planner.status === "ok" && !hasCalendar;

  function refresh() {
    setLocalError("");
    startTransition(async () => {
      const result = await syncYoutubeAction();
      if (!result.ok) {
        setLocalError(result.error || "We couldn't load the YouTube schedule.");
        return;
      }
      router.refresh();
    });
  }

  function goToday() {
    const upNextEl = document.getElementById("up-next");
    const monthEl = document.getElementById(`month-${currentMonthKey}`);
    const target = monthEl || upNextEl;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openRow(row: PlannerStreamRow) {
    if (row.status === "OPEN") return;
    setDialog({ kind: "detail", row });
  }

  function runAction(task: () => Promise<{ ok: boolean; error?: string }>) {
    setLocalError("");
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setLocalError(result.error || "Something went wrong.");
        return;
      }
      setDialog({ kind: "none" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 overflow-x-hidden">
      <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <h2 className="font-serif text-2xl leading-tight text-ink md:text-[1.75rem]">
            YouTube Schedule
          </h2>
          <p className="text-sm leading-6 text-muted">
            Plan and review Mesa&apos;s YouTube publishing calendar.
          </p>
          <p className="text-xs leading-5 text-muted">Times in Istanbul (UTC+3)</p>
          <p className="text-xs leading-5 text-muted/80">
            Last synced {planner.lastSyncedLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Today
          </button>
          {canSync ? (
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            >
              {pending ? "Refreshing…" : "Refresh YouTube"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setDialog({ kind: "add" })}
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
          >
            + Add release
          </button>
        </div>
      </div>

      {localError ? (
        <p
          role="alert"
          className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta"
        >
          {localError}
        </p>
      ) : null}

      {showHardError ? (
        <div className="space-y-4 rounded-sm border border-line bg-paper px-4 py-6">
          <p className="text-sm leading-6 text-ink">We couldn&apos;t load the YouTube schedule.</p>
          <p className="text-sm leading-6 text-muted">{planner.errorMessage}</p>
          {canSync ? (
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {showOauthNotice ? (
        <div className="space-y-3 rounded-sm border border-line bg-paper px-4 py-5">
          <p className="text-sm leading-6 text-ink">{planner.errorMessage}</p>
          {canManageAnalytics ? (
            <p className="text-sm leading-6 text-muted">
              Open the{" "}
              <Link href="/admin/youtube" className={`${adminLinkClass} ${adminFocusRing}`}>
                Channel
              </Link>{" "}
              view to connect YouTube Analytics, then refresh.
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted">
              Ask an Owner to connect YouTube Analytics, then refresh YouTube.
            </p>
          )}
        </div>
      ) : null}

      {showEmpty ? (
        <div className="rounded-sm border border-line bg-paper px-4 py-6">
          <p className="text-sm leading-6 text-ink">No releases on the calendar yet.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Add a release or wait for the next cadence slot to appear after sync.
          </p>
        </div>
      ) : null}

      {!showHardError && hasCalendar ? (
        <div className="lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:gap-8">
          <aside className="mb-6 space-y-5 lg:mb-0 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-2 lg:hidden">
              <label htmlFor={`${titleId}-month-jump`} className="sr-only">
                Jump to month
              </label>
              <select
                id={`${titleId}-month-jump`}
                className={`${adminSelectClass} w-full ${adminFocusRing}`}
                defaultValue=""
                onChange={(event) => {
                  const key = event.target.value;
                  if (!key) return;
                  document
                    .getElementById(`month-${key}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  event.target.value = "";
                }}
              >
                <option value="">Jump to month…</option>
                {planner.monthJumper.map((year) =>
                  year.months.map((month) => (
                    <option key={month.monthKey} value={month.monthKey}>
                      {month.label} {year.year}
                      {month.isCurrent ? " (current)" : ""}
                    </option>
                  )),
                )}
              </select>
            </div>

            <nav className="hidden space-y-4 lg:block" aria-label="Jump to month">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
                Jump to
              </p>
              {planner.monthJumper.map((year) => (
                <div key={year.year} className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted">{year.year}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {year.months.map((month) => (
                      <li key={month.monthKey}>
                        <a
                          href={`#month-${month.monthKey}`}
                          className={`${adminTertiaryButtonClass} ${adminFocusRing} ${
                            month.isCurrent ? "text-ink" : ""
                          }`}
                          onClick={(event) => {
                            event.preventDefault();
                            document
                              .getElementById(`month-${month.monthKey}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          {month.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="space-y-1 border-t border-line pt-4 text-sm text-muted">
              <p>
                Backlog{" "}
                <span className="font-semibold text-ink">{planner.backlog.length}</span>
              </p>
              <p>
                Attention{" "}
                <span className="font-semibold text-ink">{planner.attention.length}</span>
              </p>
            </div>
          </aside>

          <div className="min-w-0 space-y-8">
            {planner.upNext ? (
              <section id="up-next" aria-labelledby="schedule-up-next" className="space-y-3">
                <p
                  id="schedule-up-next"
                  className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive"
                >
                  Up Next
                </p>
                <article className="rounded-sm border border-line bg-paper px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <ReleaseThumb row={planner.upNext} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <h3 className="font-serif text-xl leading-snug text-ink sm:text-[1.35rem]">
                        {planner.upNext.workingTitle}
                      </h3>
                      <RowMeta row={planner.upNext} />
                      <p className="text-sm leading-6 text-ink">
                        {planner.upNext.label}
                        {planner.upNext.timeLabel ? (
                          <>
                            <span aria-hidden> · </span>
                            {planner.upNext.timeLabel} Istanbul
                          </>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {planner.upNext.status === "OPEN" ? (
                          <>
                            <button
                              type="button"
                              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                              onClick={() => setDialog({ kind: "assign", row: planner.upNext! })}
                            >
                              Assign video
                            </button>
                            <button
                              type="button"
                              className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
                              onClick={() => setDialog({ kind: "skip", row: planner.upNext! })}
                            >
                              Skip
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                            onClick={() => openRow(planner.upNext!)}
                          >
                            Open details
                          </button>
                        )}
                        {planner.upNext.youtubeVideoId ? (
                          <a
                            href={studioUrl(planner.upNext.youtubeVideoId)}
                            target="_blank"
                            rel="noreferrer"
                            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                          >
                            Open on YouTube
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              </section>
            ) : null}

            {planner.attention.length > 0 ? (
              <section aria-labelledby="schedule-attention" className="space-y-3">
                <p
                  id="schedule-attention"
                  className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive"
                >
                  Needs Attention
                </p>
                <ul className="space-y-2">
                  {planner.attention.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => openRow(row)}
                        className={`flex w-full items-start gap-3 rounded-sm border border-terracotta/25 bg-paper px-3 py-3 text-left ${adminFocusRing}`}
                      >
                        <ReleaseThumb row={row} size="sm" />
                        <span className="min-w-0 space-y-1">
                          <span className="block font-serif text-lg leading-snug text-ink">
                            {row.workingTitle}
                          </span>
                          <RowMeta row={row} />
                          <span className="block text-sm text-muted">
                            {row.label}
                            {row.timeLabel ? ` · ${row.timeLabel}` : ""}
                            <span className="sr-only"> Needs attention</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {planner.months.map((month) => {
              let weekDividerShown = false;
              const stats = monthStatusStats(month.rows);
              return (
                <section
                  key={month.monthKey}
                  id={`month-${month.monthKey}`}
                  aria-labelledby={`month-heading-${month.monthKey}`}
                  className="scroll-mt-4 space-y-3"
                >
                  <header className="sticky top-0 z-[1] space-y-1 border-b border-line bg-cream/95 py-2 backdrop-blur-sm lg:static lg:bg-transparent lg:backdrop-blur-none">
                    <h3
                      id={`month-heading-${month.monthKey}`}
                      className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-ink"
                    >
                      {monthHeaderLabel(month.label)}
                    </h3>
                    {stats ? <p className="text-xs leading-5 text-muted">{stats}</p> : null}
                  </header>

                  <ul className="space-y-2">
                    {month.rows.map((row) => {
                      const inThisWeek = isDateKeyThisWeek(row.dateKey);
                      const showWeekDivider = inThisWeek && !weekDividerShown;
                      if (showWeekDivider) weekDividerShown = true;

                      if (row.status === "OPEN") {
                        return (
                          <li key={row.id}>
                            {showWeekDivider ? (
                              <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive/80">
                                This week
                              </p>
                            ) : null}
                            <div className="flex flex-col gap-3 rounded-sm border border-dashed border-line/80 bg-paper/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 space-y-1">
                                <p className="text-sm font-semibold text-ink">Open release slot</p>
                                <p className="text-sm text-muted">
                                  {row.label}
                                  {row.timeLabel ? ` · ${row.timeLabel}` : ""}
                                </p>
                                <p className="sr-only">Status: Open</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                                  onClick={() => setDialog({ kind: "assign", row })}
                                >
                                  Assign video
                                </button>
                                <button
                                  type="button"
                                  className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
                                  onClick={() => setDialog({ kind: "skip", row })}
                                >
                                  Skip
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      }

                      const muted =
                        row.status === "PUBLISHED" || row.status === "SKIPPED"
                          ? "opacity-70"
                          : "";

                      return (
                        <li key={row.id}>
                          {showWeekDivider ? (
                            <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive/80">
                              This week
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openRow(row)}
                            className={`flex w-full items-start gap-3 rounded-sm border border-line bg-paper px-3 py-3 text-left transition-colors hover:bg-cream/60 ${adminFocusRing} ${muted}`}
                          >
                            <ReleaseThumb row={row} size="sm" />
                            <span className="min-w-0 flex-1 space-y-1">
                              <span className="block font-serif text-lg leading-snug text-ink">
                                {row.status === "SKIPPED"
                                  ? row.workingTitle || "Skipped"
                                  : row.workingTitle}
                              </span>
                              <RowMeta row={row} />
                              <span className="block text-sm text-muted">
                                {row.label}
                                {row.timeLabel ? ` · ${row.timeLabel}` : ""}
                              </span>
                              {row.status === "SKIPPED" && row.skipReason ? (
                                <span className="block text-sm text-muted">
                                  Reason: {row.skipReason}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {dialog.kind === "detail" ? (
        <DetailDrawer
          row={dialog.row}
          titleId={`${titleId}-detail`}
          pending={pending}
          onClose={closeDialog}
          onSave={(input) =>
            runAction(async () => {
              const id = localIdFromRow(dialog.row);
              if (!id) return { ok: true };
              return updateYoutubeReleaseAction({ id, ...input });
            })
          }
        />
      ) : null}

      {dialog.kind === "add" ? (
        <AddReleaseDialog
          titleId={`${titleId}-add`}
          pending={pending}
          defaultTimeLocal={planner.cadence.timeLocal}
          onClose={closeDialog}
          onSubmit={(payload) =>
            runAction(async () => createYoutubeReleaseAction(payload))
          }
        />
      ) : null}

      {dialog.kind === "assign" ? (
        <AssignSlotDialog
          row={dialog.row}
          titleId={`${titleId}-assign`}
          pending={pending}
          onClose={closeDialog}
          onSubmit={(workingTitle) =>
            runAction(async () => {
              const at = releaseInstant(dialog.row);
              return createYoutubeReleaseAction({
                workingTitle,
                status: "PLANNED",
                slotKey: dialog.row.slotKey || dialog.row.dateKey,
                releaseAt: at ? at.toISOString() : null,
                videoType: planner.cadence.videoType,
              });
            })
          }
        />
      ) : null}

      {dialog.kind === "skip" ? (
        <SkipSlotDialog
          row={dialog.row}
          titleId={`${titleId}-skip`}
          pending={pending}
          onClose={closeDialog}
          onSubmit={(skipReason) =>
            runAction(async () =>
              skipYoutubeSlotAction({
                slotKey: dialog.row.slotKey || dialog.row.dateKey,
                skipReason,
                timeLocal: planner.cadence.timeLocal,
              }),
            )
          }
        />
      ) : null}
    </div>
  );
}

function DetailDrawer({
  row,
  titleId,
  pending,
  onClose,
  onSave,
}: {
  row: PlannerStreamRow;
  titleId: string;
  pending: boolean;
  onClose: () => void;
  onSave: (input: {
    workingTitle?: string;
    status?: string;
    notes?: string;
  }) => void;
}) {
  const localId = localIdFromRow(row);
  const canEditLocal = Boolean(localId);
  const [workingTitle, setWorkingTitle] = useState(row.workingTitle);
  const [status, setStatus] = useState(row.status === "OPEN" ? "PLANNED" : row.status);
  const [notes, setNotes] = useState(row.notes || "");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <OverlayShell
      open
      onClose={onClose}
      labelledBy={titleId}
      className="absolute inset-0 flex flex-col bg-paper sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md sm:border-l sm:border-line"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="font-serif text-2xl leading-tight text-ink">
            {row.workingTitle}
          </h3>
          <RowMeta row={row} />
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
        {row.thumbnailUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-sand">
            <Image
              src={row.thumbnailUrl}
              alt=""
              fill
              className="object-cover"
              sizes="400px"
              unoptimized
            />
          </div>
        ) : null}

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
              Release time
            </dt>
            <dd className="mt-1 text-ink">
              {row.label}
              {row.timeLabel ? ` · ${row.timeLabel} Istanbul` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
              Type
            </dt>
            <dd className="mt-1 text-ink">{videoTypeLabel(row.videoType)}</dd>
          </div>
          {row.skipReason ? (
            <div>
              <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
                Skip reason
              </dt>
              <dd className="mt-1 text-ink">{row.skipReason}</dd>
            </div>
          ) : null}
          {!canEditLocal && row.notes ? (
            <div>
              <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink">{row.notes}</dd>
            </div>
          ) : null}
        </dl>

        {canEditLocal ? (
          <form
            className="space-y-4 border-t border-line pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave({ workingTitle, status, notes });
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor={`${titleId}-title`} className="text-sm font-semibold text-ink">
                Working title
              </label>
              <input
                id={`${titleId}-title`}
                className={adminInputClass}
                value={workingTitle}
                onChange={(event) => setWorkingTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${titleId}-status`} className="text-sm font-semibold text-ink">
                Status
              </label>
              <select
                id={`${titleId}-status`}
                className={`${adminSelectClass} w-full`}
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="PLANNED">Planned</option>
                <option value="BACKLOG">Backlog</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="PUBLISHED">Published</option>
                <option value="SKIPPED">Skipped</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${titleId}-notes`} className="text-sm font-semibold text-ink">
                Notes
              </label>
              <textarea
                id={`${titleId}-notes`}
                className={`${adminInputClass} min-h-[6rem] py-2.5`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : null}

        {row.youtubeVideoId ? (
          <a
            href={studioUrl(row.youtubeVideoId)}
            target="_blank"
            rel="noreferrer"
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Open on YouTube
          </a>
        ) : null}
      </div>
    </OverlayShell>
  );
}

function AddReleaseDialog({
  titleId,
  pending,
  defaultTimeLocal,
  onClose,
  onSubmit,
}: {
  titleId: string;
  pending: boolean;
  defaultTimeLocal: string;
  onClose: () => void;
  onSubmit: (payload: {
    workingTitle: string;
    status: string;
    videoType: string;
    notes: string;
    releaseAt?: string | null;
  }) => void;
}) {
  const [workingTitle, setWorkingTitle] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"backlog" | "planned" | "custom">("planned");
  const [status, setStatus] = useState("PLANNED");
  const [videoType, setVideoType] = useState("LONG");
  const [notes, setNotes] = useState("");
  const [customLocal, setCustomLocal] = useState(() => {
    const today = istanbulDateKey();
    return `${today}T${defaultTimeLocal}`;
  });
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const title = workingTitle.trim();
    if (!title) return;

    if (scheduleMode === "backlog") {
      onSubmit({
        workingTitle: title,
        status: "BACKLOG",
        videoType,
        notes,
        releaseAt: null,
      });
      return;
    }

    if (scheduleMode === "planned") {
      onSubmit({
        workingTitle: title,
        status: "PLANNED",
        videoType,
        notes,
        releaseAt: null,
      });
      return;
    }

    const iso = istanbulLocalToIso(customLocal);
    onSubmit({
      workingTitle: title,
      status,
      videoType,
      notes,
      releaseAt: iso,
    });
  }

  return (
    <OverlayShell
      open
      onClose={onClose}
      labelledBy={titleId}
      className="absolute left-1/2 top-1/2 w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-line bg-paper p-5 shadow-none"
    >
      <h3 id={titleId} className="font-serif text-2xl text-ink">
        Add release
      </h3>
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label htmlFor={`${titleId}-title`} className="text-sm font-semibold text-ink">
            Working title
          </label>
          <input
            id={`${titleId}-title`}
            required
            className={adminInputClass}
            value={workingTitle}
            onChange={(event) => setWorkingTitle(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${titleId}-schedule`} className="text-sm font-semibold text-ink">
            Schedule
          </label>
          <select
            id={`${titleId}-schedule`}
            className={`${adminSelectClass} w-full`}
            value={scheduleMode}
            onChange={(event) =>
              setScheduleMode(event.target.value as "backlog" | "planned" | "custom")
            }
          >
            <option value="planned">Leave planned (no date)</option>
            <option value="backlog">Backlog</option>
            <option value="custom">Custom date &amp; time</option>
          </select>
        </div>

        {scheduleMode === "custom" ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor={`${titleId}-when`} className="text-sm font-semibold text-ink">
                Release time (Istanbul)
              </label>
              <input
                id={`${titleId}-when`}
                type="datetime-local"
                required
                className={adminInputClass}
                value={customLocal}
                onChange={(event) => setCustomLocal(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${titleId}-status`} className="text-sm font-semibold text-ink">
                Status
              </label>
              <select
                id={`${titleId}-status`}
                className={`${adminSelectClass} w-full`}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="PLANNED">Planned</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="BACKLOG">Backlog</option>
              </select>
            </div>
          </>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={`${titleId}-type`} className="text-sm font-semibold text-ink">
            Video type
          </label>
          <select
            id={`${titleId}-type`}
            className={`${adminSelectClass} w-full`}
            value={videoType}
            onChange={(event) => setVideoType(event.target.value)}
          >
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
            <option value="SPECIAL">Special</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${titleId}-notes`} className="text-sm font-semibold text-ink">
            Notes
          </label>
          <textarea
            id={`${titleId}-notes`}
            className={`${adminInputClass} min-h-[5rem] py-2.5`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
          >
            {pending ? "Adding…" : "Add release"}
          </button>
        </div>
      </form>
    </OverlayShell>
  );
}

function AssignSlotDialog({
  row,
  titleId,
  pending,
  onClose,
  onSubmit,
}: {
  row: PlannerStreamRow;
  titleId: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (workingTitle: string) => void;
}) {
  const [workingTitle, setWorkingTitle] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <OverlayShell
      open
      onClose={onClose}
      labelledBy={titleId}
      className="absolute left-1/2 top-1/2 w-[min(100%-2rem,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-line bg-paper p-5"
    >
      <h3 id={titleId} className="font-serif text-2xl text-ink">
        Assign video
      </h3>
      <p className="mt-2 text-sm text-muted">
        {row.label}
        {row.timeLabel ? ` · ${row.timeLabel}` : ""}
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const title = workingTitle.trim();
          if (!title) return;
          onSubmit(title);
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={`${titleId}-title`} className="text-sm font-semibold text-ink">
            Working title
          </label>
          <input
            id={`${titleId}-title`}
            required
            className={adminInputClass}
            value={workingTitle}
            onChange={(event) => setWorkingTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
          >
            {pending ? "Assigning…" : "Assign"}
          </button>
        </div>
      </form>
    </OverlayShell>
  );
}

function SkipSlotDialog({
  row,
  titleId,
  pending,
  onClose,
  onSubmit,
}: {
  row: PlannerStreamRow;
  titleId: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (skipReason: string) => void;
}) {
  const [preset, setPreset] = useState<(typeof SKIP_PRESETS)[number]>("Holiday");
  const [customReason, setCustomReason] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <OverlayShell
      open
      onClose={onClose}
      labelledBy={titleId}
      className="absolute left-1/2 top-1/2 w-[min(100%-2rem,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-line bg-paper p-5"
    >
      <h3 id={titleId} className="font-serif text-2xl text-ink">
        Skip slot
      </h3>
      <p className="mt-2 text-sm text-muted">
        {row.label}
        {row.timeLabel ? ` · ${row.timeLabel}` : ""}
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const reason = preset === "Custom" ? customReason.trim() : preset;
          onSubmit(reason);
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={`${titleId}-reason`} className="text-sm font-semibold text-ink">
            Reason (optional)
          </label>
          <select
            id={`${titleId}-reason`}
            className={`${adminSelectClass} w-full`}
            value={preset}
            onChange={(event) => setPreset(event.target.value as (typeof SKIP_PRESETS)[number])}
          >
            {SKIP_PRESETS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        {preset === "Custom" ? (
          <div className="space-y-1.5">
            <label htmlFor={`${titleId}-custom`} className="text-sm font-semibold text-ink">
              Custom reason
            </label>
            <input
              id={`${titleId}-custom`}
              className={adminInputClass}
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value)}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`${adminDangerButtonClass} ${adminFocusRing}`}
          >
            {pending ? "Skipping…" : "Skip slot"}
          </button>
        </div>
      </form>
    </OverlayShell>
  );
}
