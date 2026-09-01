/** Shared Mesa auth form tokens (admin login + member modal). */

export const authFocusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export const authInputClass =
  "h-11 w-full rounded-sm border border-line bg-paper px-3.5 text-base text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15 sm:text-sm";

export const authPrimaryButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-[color,transform,background-color] duration-150 motion-reduce:transition-none hover:bg-terracotta-dark active:scale-[0.995] active:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60";

export const authGoogleButtonClass =
  "flex h-11 w-full items-center justify-center gap-3 rounded-full border border-line bg-paper text-sm font-semibold text-ink transition-[color,background-color,transform] duration-150 motion-reduce:transition-none hover:bg-cream/80 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60";

export const authLabelClass = "grid gap-2 text-sm font-semibold text-ink";

export const authLinkClass =
  "font-semibold text-terracotta transition-colors duration-150 hover:text-terracotta-dark";
