/** Shared admin UI class tokens — editorial workspace, not SaaS dashboard. */

export const adminFocusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Shared header nav link/trigger metrics so <a> and <button> share one baseline. */
export const adminNavItemClass =
  "inline-flex h-8 items-center rounded-sm text-sm font-semibold leading-none transition-colors duration-150 motion-reduce:transition-none";

export const adminInputClass =
  "h-11 w-full rounded-sm border border-line bg-paper px-3.5 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15";

export const adminSelectClass =
  "h-11 rounded-sm border border-line bg-paper px-3.5 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15";

export const adminPrimaryButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-[color,transform,background-color] duration-150 motion-reduce:transition-none hover:bg-terracotta-dark active:scale-[0.995] active:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60";

/** Secondary editor actions (save draft, move to draft, fill missing). */
export const adminSecondaryButtonClass =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

/** Text / tertiary actions (View on YouTube, Cancel, Remove). */
export const adminTertiaryButtonClass =
  "inline-flex items-center justify-center rounded-sm px-2 py-1 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

/** Destructive actions (Delete). */
export const adminDangerButtonClass =
  "inline-flex items-center justify-center rounded-sm border border-terracotta/40 bg-paper px-3 py-1.5 text-sm font-semibold text-terracotta transition-colors duration-150 motion-reduce:transition-none hover:bg-terracotta/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

export const adminLinkClass =
  "font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta";

export const adminTableHeadClass =
  "bg-sand/45 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive";

/** Data-heavy admin screens (recipes, members, visitors). */
export const adminWorkspaceWide = "max-w-[77.5rem]";

/** Forms and editorial lists (types, categories, reviews, team). */
export const adminWorkspaceStandard = "max-w-4xl";

/** Narrow account screens (legacy; prefer adminWorkspaceProfile for /admin/profile). */
export const adminWorkspaceNarrow = "max-w-xl";

/** Admin Profile page measure (~672px). */
export const adminWorkspaceProfile = "max-w-2xl";

/** @deprecated Use adminWorkspaceWide */
export const adminWorkspaceMaxWidth = adminWorkspaceWide;

/** Shared workspace inset — left grid aligns all pages; ~96–112px after sidebar on large desktop. */
export const adminWorkspacePaddingClass =
  "px-5 py-8 md:px-6 md:py-10 lg:pl-24 lg:pr-10 lg:py-10 xl:pl-28";

/** Left admin navigation width (~240px) — desktop sidebar only. */
export const adminSidebarWidthClass = "w-[15rem]";

/** Mobile nav drawer — ~82vw with a cap so labels fit without going full-screen. */
export const adminMobileDrawerWidthClass = "w-[82vw] max-w-[22rem] shrink-0";

/**
 * Mobile nav drawer + backdrop. Must sit above page sticky UI (recipe editor header
 * uses z-50; section nav uses z-40).
 */
export const adminMobileDrawerZClass = "z-[60]";

/**
 * Sidebar-only focus ring. Inset offset avoids clipping inside overflow-y-auto.
 * Do not swap in for global `adminFocusRing` (used across the admin workspace).
 */
export const adminSidebarFocusRing =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta";

/** Sidebar nav rows: ≥44px touch, 36px desktop. */
export const adminSidebarLinkClass =
  "flex min-h-11 items-center rounded-none px-3 text-sm font-medium leading-snug transition-colors duration-150 motion-reduce:transition-none lg:min-h-9";

/** Section labels — apply top spacing per section index in the nav (not via first:). */
export const adminSidebarSectionLabelClass =
  "px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-olive";
