import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex flex-col leading-none ${className}`}>
      <span className="font-serif text-2xl tracking-tight text-ink md:text-[1.7rem]">
        Mesa
      </span>
      <span className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-olive">
        Kitchen Studio
      </span>
    </Link>
  );
}
