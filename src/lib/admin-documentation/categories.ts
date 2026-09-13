import type { AdminDocCategory } from "./types";

/** Category labels for the Documentation Center and drawer chrome. */
export const ADMIN_DOC_CATEGORY_LABELS: Record<AdminDocCategory, string> = {
  publishing: "Publishing",
  library: "Library",
  community: "Community",
  analytics: "Analytics",
  team: "Team",
  account: "Account",
};

export const ADMIN_DOC_CATEGORY_ORDER: AdminDocCategory[] = [
  "publishing",
  "library",
  "community",
  "analytics",
  "team",
  "account",
];
