/**
 * Roadmap #13 Phase 13D — browser-safe Growth Opportunities presentation helpers.
 * No Prisma / server loaders. Client may import this module.
 */

import {
  GROWTH_OPPORTUNITY_PRIORITIES,
  GROWTH_OPPORTUNITY_TYPE_LABELS,
  GROWTH_OPPORTUNITY_TYPES,
  type GrowthOpportunity,
  type GrowthOpportunityPriority,
  type GrowthOpportunityType,
} from "@/lib/growth-opportunities";

export type GrowthTypeFilter = "all" | GrowthOpportunityType;
export type GrowthPriorityFilter = "all" | GrowthOpportunityPriority;

export const GROWTH_PRIORITY_LABELS: Record<GrowthOpportunityPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const GROWTH_TYPE_FILTER_OPTIONS: Array<{
  value: GrowthTypeFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  ...GROWTH_OPPORTUNITY_TYPES.map((type) => ({
    value: type as GrowthTypeFilter,
    label: GROWTH_OPPORTUNITY_TYPE_LABELS[type],
  })),
];

export const GROWTH_PRIORITY_FILTER_OPTIONS: Array<{
  value: GrowthPriorityFilter;
  label: string;
}> = [
  { value: "all", label: "All priorities" },
  ...GROWTH_OPPORTUNITY_PRIORITIES.map((priority) => ({
    value: priority as GrowthPriorityFilter,
    label: GROWTH_PRIORITY_LABELS[priority],
  })),
];

export function growthOpportunityTypeLabel(type: GrowthOpportunityType): string {
  return GROWTH_OPPORTUNITY_TYPE_LABELS[type] ?? type;
}

export function growthOpportunityPriorityLabel(
  priority: GrowthOpportunityPriority,
): string {
  return GROWTH_PRIORITY_LABELS[priority] ?? priority;
}

/** Defensive: Growth action links must stay on Admin relative paths. */
export function isSafeAdminGrowthHref(href: string): boolean {
  const raw = String(href || "");
  // Reject control characters before trim so trailing newlines cannot sanitize away.
  if (raw.includes("\0") || raw.includes("\n") || raw.includes("\r")) return false;
  const value = raw.trim();
  if (!value.startsWith("/admin/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.toLowerCase().includes("javascript:")) return false;
  if (value.toLowerCase().includes("data:")) return false;
  if (value.includes("://")) return false;
  if (value.includes("\\")) return false;
  return true;
}

export function summarizeGrowthPriorities(opportunities: readonly GrowthOpportunity[]) {
  const counts = { high: 0, medium: 0, low: 0, total: opportunities.length };
  for (const opportunity of opportunities) {
    if (opportunity.priority === "high") counts.high += 1;
    else if (opportunity.priority === "medium") counts.medium += 1;
    else if (opportunity.priority === "low") counts.low += 1;
  }
  return counts;
}

/**
 * Client-side presentation filter. Preserves source order.
 * Does not recompute priorities or invent opportunities.
 */
export function filterGrowthOpportunities(
  opportunities: readonly GrowthOpportunity[],
  filters: { type?: GrowthTypeFilter; priority?: GrowthPriorityFilter },
): GrowthOpportunity[] {
  const type = filters.type ?? "all";
  const priority = filters.priority ?? "all";
  return opportunities.filter((opportunity) => {
    if (type !== "all" && opportunity.type !== type) return false;
    if (priority !== "all" && opportunity.priority !== priority) return false;
    return true;
  });
}
