"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncYoutubeAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminLinkClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import type { YoutubeScheduleDashboard, ScheduledVideoRow } from "@/lib/youtube-data/schedule";

type Props = {
  schedule: YoutubeScheduleDashboard;
  canSync: boolean;
  canManageAnalytics: boolean;
};

function ScheduleItem({
  item,
  emphasized,
}: {
  item: ScheduledVideoRow;
  emphasized?: boolean;
}) {
  const showYoutubeTitle =
    item.youtubeTitle.trim() &&
    item.youtubeTitle.trim().toLowerCase() !== item.displayTitle.trim().toLowerCase();

  return (
    <article
      className={`grid gap-4 border-b border-line py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-5 ${
        emphasized ? "border-t border-line pt-5" : ""
      }`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-sand sm:w-[7.5rem]">
        {item.thumbnailUrl ? (
          <Image
            src={item.thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            sizes="120px"
            unoptimized
          />
        ) : null}
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 space-y-1.5">
            <h3 className="font-serif text-xl leading-snug text-ink sm:text-[1.35rem]">
              {item.displayTitle}
            </h3>
            {showYoutubeTitle ? (
              <p className="text-sm leading-5 text-muted">YouTube: {item.youtubeTitle}</p>
            ) : null}
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
              {item.formatLabel}
              <span className="mx-2 text-line" aria-hidden>
                ·
              </span>
              <span className="tracking-[0.12em]">{item.statusLabel}</span>
            </p>
            <p className="text-sm leading-6 text-ink">
              <span className="sr-only">Scheduled for </span>
              {item.scheduledDateLabel}
              <span aria-hidden> · </span>
              {item.scheduledTimeLabel} {item.timezoneLabel}
            </p>
            {item.recipe ? (
              <p className="text-sm leading-6 text-muted">
                Recipe:{" "}
                <Link
                  href={`/admin/recipes/${item.recipe.id}`}
                  className={`${adminLinkClass} ${adminFocusRing}`}
                >
                  {item.recipe.title}
                </Link>
              </p>
            ) : null}
            {item.seriesTitle ? (
              <p className="text-sm leading-6 text-muted">Series: {item.seriesTitle}</p>
            ) : null}
          </div>

          <div className="shrink-0 sm:pt-1">
            <a
              href={item.studioUrl}
              target="_blank"
              rel="noreferrer"
              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            >
              Open on YouTube
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

export function YoutubeSchedulePanel({ schedule, canSync, canManageAnalytics }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState("");

  const hasItems = Boolean(schedule.nextUp) || schedule.upcoming.length > 0;
  const showHardError = schedule.status === "error" && !hasItems;
  const showOauthNotice = schedule.status === "needs_oauth";

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <h2 className="font-serif text-2xl leading-tight text-ink md:text-[1.75rem]">
            Scheduled videos
          </h2>
          <p className="text-sm leading-6 text-muted">
            Upcoming videos scheduled for publication on the Mesa Kitchen Studio YouTube channel.
          </p>
          <p className="text-xs leading-5 text-muted">
            Last synced: {schedule.lastSyncedLabel} GMT · Times in GMT
          </p>
        </div>
        {canSync ? (
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            {pending ? "Refreshing…" : "Refresh Public YouTube"}
          </button>
        ) : null}
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
          <p className="text-sm leading-6 text-muted">{schedule.errorMessage}</p>
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
          <p className="text-sm leading-6 text-ink">{schedule.errorMessage}</p>
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
              Ask an Owner to connect YouTube Analytics, then refresh the public catalog.
            </p>
          )}
        </div>
      ) : null}

      {!showHardError && !hasItems && schedule.status === "ok" ? (
        <div className="rounded-sm border border-line bg-paper px-4 py-6">
          <p className="text-sm leading-6 text-ink">No upcoming videos are currently scheduled.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            When a video is scheduled on YouTube, it will appear here after the next sync.
          </p>
        </div>
      ) : null}

      {!showHardError && !hasItems && schedule.status === "needs_oauth" ? null : null}

      {!showHardError && schedule.nextUp ? (
        <section aria-labelledby="schedule-next-up" className="space-y-3">
          <p
            id="schedule-next-up"
            className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive"
          >
            Next up
          </p>
          <div className="rounded-sm border border-line bg-paper px-4 sm:px-5">
            <ScheduleItem item={schedule.nextUp} emphasized />
          </div>
        </section>
      ) : null}

      {!showHardError && schedule.upcoming.length > 0 ? (
        <section aria-labelledby="schedule-upcoming" className="space-y-1">
          <p
            id="schedule-upcoming"
            className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive"
          >
            Upcoming
          </p>
          <ul className="list-none">
            {schedule.upcoming.map((item) => (
              <li key={item.videoId}>
                <ScheduleItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
