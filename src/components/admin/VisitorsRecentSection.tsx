"use client";

import { useState } from "react";
import Link from "next/link";
import {
  VisitorsSelectModeToggle,
  VisitorsTable,
} from "@/components/admin/VisitorsTable";
import {
  GUEST_TRAFFIC_SOURCES,
  guestTrafficSourceLabel,
  type GuestTrafficSource,
} from "@/lib/guest-acquisition";
import type {
  GuestKindFilter,
  GuestVisitorAdminListResult,
} from "@/lib/guest-analytics";
import { adminFocusRing } from "@/lib/admin-ui";
import type { AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

function buildVisitorsHref(input: {
  range: AnalyticsRangeDays;
  kind: GuestKindFilter;
  source: GuestTrafficSource | "all";
  q: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.range !== 7) params.set("range", String(input.range));
  if (input.kind !== "humans") params.set("kind", input.kind);
  if (input.source !== "all") params.set("source", input.source);
  if (input.q) params.set("q", input.q);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const qs = params.toString();
  return qs ? `/admin/visitors?${qs}` : "/admin/visitors";
}

const chipBase = `rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${adminFocusRing}`;
const chipActive = "bg-sand text-ink";
const chipIdle = "text-muted hover:text-ink";

export function VisitorsRecentSection({
  list,
  range,
  kind,
  source,
  q,
  canDeleteVisitors = false,
}: {
  list: GuestVisitorAdminListResult;
  range: AnalyticsRangeDays;
  kind: GuestKindFilter;
  source: GuestTrafficSource | "all";
  q: string;
  canDeleteVisitors?: boolean;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const resultKey = `${range}-${kind}-${source}-${q}-${list.page}`;

  return (
    <section aria-labelledby="recent-visitors-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="recent-visitors-heading" className="font-serif text-xl text-ink">
            Recent visitors
          </h2>
          <p className="mt-1 text-xs text-muted">
            {list.total === 0
              ? "No matching visitors"
              : `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${list.total.toLocaleString("en-US")}`}
          </p>
        </div>
        <VisitorsSelectModeToggle
          canDelete={canDeleteVisitors}
          selectMode={selectMode}
          onSelectModeChange={setSelectMode}
        />
      </div>

      <div
        className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1"
        role="group"
        aria-label="Visitor classification"
      >
        {(
          [
            ["humans", "Humans"],
            ["likely_automated", "Likely automated"],
            ["bots", "Bots"],
            ["unknown", "Unknown"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={buildVisitorsHref({ range, kind: value, source, q })}
            className={`${chipBase} ${kind === value ? chipActive : chipIdle}`}
            aria-current={kind === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </div>

      <form
        className="flex min-w-0 flex-wrap items-center gap-2"
        method="get"
        action="/admin/visitors"
      >
        <input type="hidden" name="range" value={String(range)} />
        <input type="hidden" name="kind" value={kind} />
        <label className="sr-only" htmlFor="visitors-search">
          Search guest or page
        </label>
        <input
          id="visitors-search"
          name="q"
          defaultValue={q}
          placeholder="Search guest or page…"
          className={`min-w-[12rem] flex-1 rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
        />
        <label htmlFor="visitors-source" className="sr-only">
          Filter by traffic source
        </label>
        <select
          id="visitors-source"
          name="source"
          defaultValue={source}
          className={`rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink ${adminFocusRing}`}
        >
          <option value="all">All sources</option>
          {GUEST_TRAFFIC_SOURCES.map((value) => (
            <option key={value} value={value}>
              {guestTrafficSourceLabel(value)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={`rounded-sm border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
        >
          Apply
        </button>
      </form>

      {/* Remount clears selection when page/filter/search changes. */}
      <VisitorsTable
        key={resultKey}
        visitors={list.rows}
        canDelete={canDeleteVisitors}
        selectMode={selectMode}
        onSelectModeChange={setSelectMode}
      />

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
          aria-label="Pagination"
        >
          <p className="text-muted">
            Page {list.page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {list.page > 1 ? (
              <Link
                href={buildVisitorsHref({ range, kind, source, q, page: list.page - 1 })}
                className={`rounded-sm border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-sm border border-line px-3 py-1.5 text-muted">Previous</span>
            )}
            {list.page < totalPages ? (
              <Link
                href={buildVisitorsHref({ range, kind, source, q, page: list.page + 1 })}
                className={`rounded-sm border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Next
              </Link>
            ) : (
              <span className="rounded-sm border border-line px-3 py-1.5 text-muted">Next</span>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
