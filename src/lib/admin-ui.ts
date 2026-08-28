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

export const adminLinkClass =
  "font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta";

export const adminTableHeadClass =
  "bg-sand/45 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive";

/** Data-heavy admin screens (recipes, members, visitors). */
export const adminWorkspaceWide = "max-w-[77.5rem]";

/** Forms and editorial lists (types, categories, reviews, team). */
export const adminWorkspaceStandard = "max-w-4xl";

/** Account-oriented screens (profile). */
export const adminWorkspaceNarrow = "max-w-xl";

/** @deprecated Use adminWorkspaceWide */
export const adminWorkspaceMaxWidth = adminWorkspaceWide;

/** Shared workspace inset — left grid aligns all pages; ~96–112px after sidebar on large desktop. */
export const adminWorkspacePaddingClass =
  "px-5 py-8 md:px-6 md:py-10 lg:pl-24 lg:pr-10 lg:py-10 xl:pl-28";

/** Left admin navigation width (~240px). */
export const adminSidebarWidthClass = "w-[15rem]";

export const adminSidebarLinkClass =
  "flex min-h-10 items-center rounded-sm px-3 text-sm font-semibold leading-snug transition-colors duration-150 motion-reduce:transition-none";

export const adminSidebarSectionLabelClass =
  "px-3 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive first:pt-0";
