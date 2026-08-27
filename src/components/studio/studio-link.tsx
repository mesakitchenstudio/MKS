export const studioFocusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Editorial text link used for “Read the lesson →” / “About the studio →”. */
export const studioTextLinkClass = `inline-flex items-center text-sm text-muted underline-offset-4 transition-[color,transform] duration-150 hover:text-terracotta hover:underline motion-safe:hover:translate-x-0.5 motion-reduce:transform-none ${studioFocusRing}`;

export const studioTitleLinkClass = `rounded-sm text-ink transition-colors duration-150 hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta`;

export const studioCardLinkClass = `group flex h-full w-full text-ink no-underline ${studioFocusRing}`;

export function StudioLinkArrow() {
  return (
    <span aria-hidden className="ms-1.5">
      →
    </span>
  );
}
