import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  adminFocusRing,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import {
  contentCalendarAccessForRole,
  loadContentCalendar,
} from "@/lib/content-calendar/load";
import { istanbulTodayDateKey, parseCalendarYearMonth } from "@/lib/content-calendar/ranges";

export const metadata: Metadata = {
  title: "Content Calendar",
};

export const dynamic = "force-dynamic";

function qs(params: Record<string, string | number | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    next.set(key, String(value));
  }
  const s = next.toString();
  return s ? `/admin/content-calendar?${s}` : "/admin/content-calendar";
}

export default async function AdminContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    channel?: string;
    timing?: string;
    linked?: string;
    q?: string;
  }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canAccess(admin.role, "content") && !canAccess(admin.role, "youtube")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const access = contentCalendarAccessForRole(admin.role);
  const dashboard = await loadContentCalendar({
    year: params.year,
    month: params.month,
    channel: params.channel as "all" | "website" | "youtube" | undefined,
    timing: params.timing as "all" | "upcoming" | "published" | undefined,
    linked: params.linked as "all" | "linked" | "unlinked" | undefined,
    q: params.q,
    access,
  });

  const today = parseCalendarYearMonth({
    year: istanbulTodayDateKey().slice(0, 4),
    month: istanbulTodayDateKey().slice(5, 7),
  });

  const filterBase = {
    year: dashboard.month.year,
    month: dashboard.month.month,
    channel: dashboard.filters.channel,
    timing: dashboard.filters.timing,
    linked: dashboard.filters.linked,
    q: dashboard.filters.q,
  };

  const daysWithItems = dashboard.days.filter((day) => day.entries.length > 0);
  const emptyMonth = daysWithItems.length === 0;

  return (
    <div className="min-w-0 space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Content Calendar</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Editorial planning across website Recipe publication and YouTube releases. Each channel
            keeps its own schedule — Calendar coordinates, it does not own either system.
          </p>
          <p className="mt-2 text-sm text-muted">
            Times shown in Europe/Istanbul · Today is {dashboard.todayDateKey}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={qs({ year: today.year, month: today.month })}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Jump to Today
          </Link>
          {access.canViewRecipes ? (
            <Link href="/admin/recipes/new" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
              + Recipe
            </Link>
          ) : null}
          {access.canViewYoutube ? (
            <Link
              href="/admin/youtube?view=schedule"
              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            >
              + YouTube release
            </Link>
          ) : null}
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-3" aria-label="Month navigation">
        <Link
          href={qs({ ...filterBase, year: dashboard.prev.year, month: dashboard.prev.month })}
          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
        >
          Previous
        </Link>
        <h2 className="font-serif text-2xl text-ink">{dashboard.monthLabel}</h2>
        <Link
          href={qs({ ...filterBase, year: dashboard.next.year, month: dashboard.next.month })}
          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
        >
          Next
        </Link>
      </section>

      <p className="text-sm text-muted">
        Website {dashboard.websiteCount} · YouTube {dashboard.youtubeCount}
        {access.canViewRecipes ? ` · Unscheduled drafts ${dashboard.unscheduledDraftCount}` : ""}
        {access.canViewYoutube
          ? ` · Undated/backlog YouTube ${dashboard.unscheduledYoutubeCount}`
          : ""}
      </p>

      <form
        id="calendar-filters"
        method="get"
        className="flex flex-wrap gap-3 border border-line bg-paper px-4 py-3"
      >
        <label className="text-sm text-muted">
          Year
          <select name="year" defaultValue={dashboard.month.year} className="ml-2 border border-line px-2 py-1">
            {[dashboard.month.year - 1, dashboard.month.year, dashboard.month.year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Month
          <select name="month" defaultValue={dashboard.month.month} className="ml-2 border border-line px-2 py-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Channel
          <select name="channel" defaultValue={dashboard.filters.channel} className="ml-2 border border-line px-2 py-1">
            <option value="all">All</option>
            {access.canViewRecipes ? <option value="website">Website</option> : null}
            {access.canViewYoutube ? <option value="youtube">YouTube</option> : null}
          </select>
        </label>
        <label className="text-sm text-muted">
          Timing
          <select name="timing" defaultValue={dashboard.filters.timing} className="ml-2 border border-line px-2 py-1">
            <option value="all">All</option>
            <option value="upcoming">Upcoming</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className="text-sm text-muted">
          Linked
          <select name="linked" defaultValue={dashboard.filters.linked} className="ml-2 border border-line px-2 py-1">
            <option value="all">All</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Unlinked</option>
          </select>
        </label>
        <label className="text-sm text-muted">
          Search
          <input
            name="q"
            defaultValue={dashboard.filters.q}
            placeholder="Title"
            className="ml-2 border border-line px-2 py-1"
          />
        </label>
        <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
          Apply
        </button>
      </form>

      <section aria-labelledby="cc-year" className="space-y-2">
        <h2 id="cc-year" className="font-serif text-xl text-ink">
          {dashboard.month.year} overview
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.yearOverview.map((row) => (
            <li key={row.monthKey}>
              <Link
                href={qs({ ...filterBase, year: row.year, month: row.month })}
                className={`block border border-line px-3 py-2 text-sm ${adminFocusRing} ${
                  row.monthKey === dashboard.month.monthKey ? "bg-paper" : ""
                }`}
              >
                <span className="font-semibold text-ink">{row.monthLabel}</span>
                <br />
                <span className="text-muted">
                  Website {row.websiteCount} · YouTube {row.youtubeCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {emptyMonth ? (
        <section className="rounded-sm border border-line bg-paper px-4 py-6">
          <h2 className="font-serif text-2xl text-ink">No releases planned for this month</h2>
          <p className="mt-2 text-sm text-muted">
            Schedule a Recipe or plan a YouTube release in their source tools.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {access.canViewRecipes ? (
              <Link href="/admin" className={`${adminLinkClass} ${adminFocusRing}`}>
                Schedule a Recipe
              </Link>
            ) : null}
            {access.canViewYoutube ? (
              <Link href="/admin/youtube?view=schedule" className={`${adminLinkClass} ${adminFocusRing}`}>
                Plan a YouTube release
              </Link>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="space-y-6" aria-label={`${dashboard.monthLabel} agenda`}>
          {daysWithItems.map((day) => (
            <div key={day.dateKey} className="border-t border-line pt-4">
              <h3 className="font-serif text-xl text-ink">
                {day.weekdayLabel} · {day.dateKey}
                {day.isToday ? (
                  <span className="ml-2 text-sm font-sans font-semibold uppercase tracking-wide text-muted">
                    Today
                  </span>
                ) : null}
              </h3>
              <ul className="mt-3 space-y-3">
                {day.entries.map((entry) => (
                  <li key={`${entry.source}-${entry.sourceId}`} className="border border-line bg-paper px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          {entry.localTime || "—"} · {entry.source === "recipe" ? "Website" : "YouTube"}
                          {entry.source === "youtube" ? ` · ${entry.videoType}` : ""}
                        </p>
                        <p className="mt-1 font-serif text-xl text-ink">{entry.title}</p>
                        <p className="mt-1 text-sm text-muted">
                          {entry.statusLabel}
                          {entry.source === "recipe" && entry.needsAttention
                            ? " · Needs attention"
                            : ""}
                          {entry.linkedTitle
                            ? entry.source === "recipe"
                              ? ` · Linked YouTube: ${entry.linkedTitle}`
                              : ` · Linked to Website Recipe: ${entry.linkedTitle}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <Link href={entry.href} className={`${adminLinkClass} ${adminFocusRing}`}>
                          {entry.source === "recipe" ? "Open recipe" : "Open release"}
                        </Link>
                        {entry.source === "recipe" &&
                        entry.statusLabel === "Published" &&
                        access.canViewPerformance ? (
                          <Link
                            href={entry.performanceHref}
                            className={`${adminLinkClass} ${adminFocusRing}`}
                          >
                            View performance
                          </Link>
                        ) : null}
                        {entry.source === "recipe" && entry.needsAttention ? (
                          <Link href={entry.href} className={`${adminLinkClass} ${adminFocusRing}`}>
                            Review recipe
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {(dashboard.unscheduledDraftCount > 0 || dashboard.unscheduledYoutubeCount > 0) && (
        <section className="border-t border-line pt-6 text-sm text-muted">
          {access.canViewRecipes && dashboard.unscheduledDraftCount > 0 ? (
            <p>
              Unscheduled drafts — {dashboard.unscheduledDraftCount}{" "}
              <Link href="/admin" className={`${adminLinkClass} ${adminFocusRing}`}>
                View recipes
              </Link>
            </p>
          ) : null}
          {access.canViewYoutube && dashboard.unscheduledYoutubeCount > 0 ? (
            <p className="mt-2">
              Unscheduled YouTube plans — {dashboard.unscheduledYoutubeCount}{" "}
              <Link href="/admin/youtube?view=schedule" className={`${adminLinkClass} ${adminFocusRing}`}>
                Open Release Planner
              </Link>
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
