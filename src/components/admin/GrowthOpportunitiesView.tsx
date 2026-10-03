"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  adminFocusRing,
  adminSecondaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import type { GrowthOpportunity } from "@/lib/growth-opportunities";
import {
  GROWTH_PRIORITY_FILTER_OPTIONS,
  GROWTH_TYPE_FILTER_OPTIONS,
  filterGrowthOpportunities,
  growthOpportunityPriorityLabel,
  growthOpportunityTypeLabel,
  isSafeAdminGrowthHref,
  summarizeGrowthPriorities,
  type GrowthPriorityFilter,
  type GrowthTypeFilter,
} from "@/lib/growth-opportunities-ui";

function priorityBadgeClass(priority: GrowthOpportunity["priority"]) {
  if (priority === "high") {
    return "border-terracotta/35 bg-terracotta/10 text-terracotta-dark";
  }
  if (priority === "medium") {
    return "border-olive/30 bg-sand/50 text-olive";
  }
  return "border-line bg-cream text-muted";
}

export function GrowthOpportunitiesView({
  opportunities,
  generatedLabel,
}: {
  opportunities: GrowthOpportunity[];
  generatedLabel?: string;
}) {
  const [typeFilter, setTypeFilter] = useState<GrowthTypeFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<GrowthPriorityFilter>("all");

  const summary = useMemo(
    () => summarizeGrowthPriorities(opportunities),
    [opportunities],
  );

  const visible = useMemo(
    () =>
      filterGrowthOpportunities(opportunities, {
        type: typeFilter,
        priority: priorityFilter,
      }),
    [opportunities, typeFilter, priorityFilter],
  );

  const filtersActive = typeFilter !== "all" || priorityFilter !== "all";

  if (opportunities.length === 0) {
    return (
      <div className="min-w-0 space-y-6">
        <SummaryStrip summary={summary} generatedLabel={generatedLabel} />
        <section
          className="rounded-sm border border-line bg-paper px-4 py-8 sm:px-5"
          aria-labelledby="growth-empty-heading"
        >
          <h2 id="growth-empty-heading" className="font-serif text-xl text-ink">
            Nothing urgent found under current rules.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Mesa only checks the deterministic signals currently supported by this
            dashboard.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <SummaryStrip summary={summary} generatedLabel={generatedLabel} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[16rem]">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">
            Type
          </span>
          <select
            className={`${adminSelectClass} w-full ${adminFocusRing}`}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as GrowthTypeFilter)}
            aria-label="Filter by opportunity type"
          >
            {GROWTH_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[14rem]">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">
            Priority
          </span>
          <select
            className={`${adminSelectClass} w-full ${adminFocusRing}`}
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as GrowthPriorityFilter)
            }
            aria-label="Filter by priority"
          >
            {GROWTH_PRIORITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {filtersActive ? (
          <button
            type="button"
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            onClick={() => {
              setTypeFilter("all");
              setPriorityFilter("all");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        Showing {visible.length} of {summary.total}
      </p>

      {visible.length === 0 ? (
        <section
          className="rounded-sm border border-line bg-paper px-4 py-8 sm:px-5"
          aria-labelledby="growth-filter-empty-heading"
        >
          <h2 id="growth-filter-empty-heading" className="font-serif text-xl text-ink">
            No opportunities match these filters.
          </h2>
          <p className="mt-2 text-sm text-muted">
            Try another type or priority, or clear filters to see the full list.
          </p>
        </section>
      ) : (
        <ul className="space-y-4" aria-label="Growth opportunities">
          {visible.map((opportunity) => (
            <li key={opportunity.id}>
              <GrowthOpportunityCard opportunity={opportunity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryStrip({
  summary,
  generatedLabel,
}: {
  summary: ReturnType<typeof summarizeGrowthPriorities>;
  generatedLabel?: string;
}) {
  return (
    <section aria-label="Opportunity summary" className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Total" value={summary.total} />
        <SummaryTile label="High" value={summary.high} />
        <SummaryTile label="Medium" value={summary.medium} />
        <SummaryTile label="Low" value={summary.low} />
      </div>
      {generatedLabel ? (
        <p className="text-xs text-muted">Generated {generatedLabel}</p>
      ) : null}
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-line bg-paper px-3 py-3 sm:px-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl text-ink tabular-nums sm:text-3xl">{value}</p>
    </div>
  );
}

function GrowthOpportunityCard({ opportunity }: { opportunity: GrowthOpportunity }) {
  const safeHref = isSafeAdminGrowthHref(opportunity.href) ? opportunity.href : null;
  const priorityLabel = growthOpportunityPriorityLabel(opportunity.priority);
  const typeLabel = growthOpportunityTypeLabel(opportunity.type);

  return (
    <article
      className="rounded-sm border border-line bg-paper px-4 py-4 sm:px-5"
      data-opportunity-id={opportunity.id}
      data-rule-id={opportunity.ruleId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-sm border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] ${priorityBadgeClass(opportunity.priority)}`}
        >
          {priorityLabel}
        </span>
        <span className="inline-flex rounded-sm border border-line bg-cream px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted">
          {typeLabel}
        </span>
      </div>

      <h2 className="mt-3 font-serif text-xl leading-snug text-ink break-words">
        {opportunity.title}
      </h2>

      {opportunity.evidence.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink">
          {opportunity.evidence.map((line, index) => (
            <li key={`${opportunity.id}-ev-${index}`} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {opportunity.priorityReason ? (
        <p className="mt-3 text-sm leading-6 text-muted break-words">
          <span className="font-semibold text-ink">Why this priority:</span>{" "}
          {opportunity.priorityReason}
        </p>
      ) : null}

      <div className="mt-4">
        {safeHref ? (
          <Link
            href={safeHref}
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            {opportunity.actionLabel}
          </Link>
        ) : (
          <span className="text-sm text-muted">{opportunity.actionLabel}</span>
        )}
      </div>
    </article>
  );
}
