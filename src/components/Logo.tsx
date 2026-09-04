import Link from "next/link";
import type { ReactNode } from "react";

export function Logo({
  className = "",
  href = "/",
  aside,
}: {
  className?: string;
  href?: string;
  /** Optional second-line label (e.g. “Studio admin”), baseline-aligned with Kitchen Studio. */
  aside?: ReactNode;
}) {
  return (
    <Link href={href} className={`group inline-flex flex-col leading-none ${className}`}>
      <span className="font-serif text-2xl tracking-tight text-ink md:text-[1.7rem]">
        Mesa
      </span>
      <span className="mt-0.5 inline-flex items-baseline gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-olive">
        <span>Kitchen Studio</span>
        {aside ? (
          <>
            <span aria-hidden className="font-normal text-olive/70">
              ·
            </span>
            <span className="text-olive/90">{aside}</span>
          </>
        ) : null}
      </span>
    </Link>
  );
}
