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

/**
 * Admin button system — modest rectangular controls (not pills).
 * Desktop standard ~40px; touch/narrow layouts expand to ~44px via min-h-11.
 * Radius ~6px (`rounded-md`). Disabled keeps the same geometry with muted opacity.
 */
const adminButtonGeometry =
  "inline-flex shrink-0 items-center justify-center rounded-md text-sm font-semibold transition-[color,transform,background-color,border-color] duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55";

/** Primary — terracotta fill, light text. */
export const adminPrimaryButtonClass = `${adminButtonGeometry} min-h-11 bg-terracotta px-4 text-paper hover:bg-terracotta-dark active:scale-[0.995] active:bg-terracotta-dark sm:min-h-10`;

/** Compact primary — dense chrome (sticky Update, inline Add). ~36px desktop. */
export const adminCompactPrimaryButtonClass = `${adminButtonGeometry} min-h-11 bg-terracotta px-3.5 text-paper hover:bg-terracotta-dark active:scale-[0.995] active:bg-terracotta-dark sm:min-h-9`;

/** Secondary — paper + hairline border, same geometry as primary. */
export const adminSecondaryButtonClass = `${adminButtonGeometry} min-h-11 border border-line bg-paper px-4 text-ink hover:bg-cream hover:text-ink sm:min-h-10`;

/** Compact secondary — Preview / Cancel in dense bars. */
export const adminCompactSecondaryButtonClass = `${adminButtonGeometry} min-h-11 border border-line bg-paper px-3.5 text-ink hover:bg-cream hover:text-ink sm:min-h-9`;

/** Tertiary — quiet text action (Edit, View, Add type-specific field). */
export const adminTertiaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md px-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-0";

/** Destructive — quiet terracotta text (not a filled red button). */
export const adminDangerButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md px-1.5 text-sm font-semibold text-terracotta transition-colors duration-150 motion-reduce:transition-none hover:bg-terracotta/5 hover:text-terracotta-dark disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-0";

/**
 * Icon / overflow trigger — square hit target; expand on touch.
 * Pair with an accessible name (e.g. More actions for …).
 */
export const adminIconButtonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-base leading-none tracking-tight text-muted/70 transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-ink disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-8 sm:min-w-8 sm:text-sm";

export const adminLinkClass =
  "font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta";

export const adminTableHeadClass =
  "bg-sand/45 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive";

/** Data-heavy admin screens (members, visitors, youtube, recipe editor). */
export const adminWorkspaceWide = "max-w-[77.5rem]";

/** Recipes index publishing ledger (~1120px) — tighter than adminWorkspaceWide. */
export const adminWorkspaceRecipes = "max-w-[70rem]";

/** Forms and editorial lists (team). */
export const adminWorkspaceStandard = "max-w-4xl";

/** Recipe Types template ledger (~1024px) — wider than standard, tighter than Recipes index. */
export const adminWorkspaceTypes = "max-w-5xl";

/** Categories taxonomy ledger (~1024px) — matches Recipe Types measure. */
export const adminWorkspaceCategories = "max-w-5xl";

/** Series editorial ledger (~1024px) — matches Categories / Recipe Types measure. */
export const adminWorkspaceSeries = "max-w-5xl";

/** Narrow account screens (legacy; prefer adminWorkspaceProfile for /admin/profile). */
export const adminWorkspaceNarrow = "max-w-xl";

/** Admin Profile page measure (~672px). */
export const adminWorkspaceProfile = "max-w-2xl";

/** Members directory (~1024px) — four-column roster. */
export const adminWorkspaceMembersList = "max-w-5xl";

/** Newsletter subscribers ledger (~1024px) — matches Members list measure. */
export const adminWorkspaceNewsletter = "max-w-5xl";

/** Member detail editorial measure (~832px). */
export const adminWorkspaceMembersDetail = "max-w-[52rem]";

/** Reviews index ledger (~1024px) — five-column triage table. */
export const adminWorkspaceReviewsList = "max-w-5xl";

/** Review detail conversation (~928px). */
export const adminWorkspaceReviewsDetail = "max-w-[58rem]";

/** @deprecated Prefer adminWorkspaceReviewsList / adminWorkspaceReviewsDetail. */
export const adminWorkspaceReviews = adminWorkspaceReviewsList;

/** @deprecated Use adminWorkspaceWide */
export const adminWorkspaceMaxWidth = adminWorkspaceWide;

/** Shared workspace inset — left grid aligns all pages; ~96–112px after sidebar on large desktop. */
export const adminWorkspacePaddingClass =
  "px-5 py-8 md:px-6 md:py-10 lg:pl-24 lg:pr-10 lg:py-10 xl:pl-28";

/**
 * Recipe-editor sticky chrome horizontal bleed.
 * Must mirror adminWorkspacePaddingClass so the opaque sticky layer covers the full
 * padded editor column (esp. iPad Safari with the persistent sidebar).
 */
export const adminRecipeEditorStickyBleedClass =
  "-mx-5 px-5 md:-mx-6 md:px-6 lg:-ml-24 lg:-mr-10 lg:pl-24 lg:pr-10 xl:-ml-28 xl:pl-28";

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
