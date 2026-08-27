import type { AboutPrinciple } from "@/data/about";

export function AboutPrincipleItem({ principle }: { principle: AboutPrinciple }) {
  return (
    <article className="flex h-full flex-col">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-olive/70">
        {principle.number}
      </p>
      <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
        {principle.label}
      </p>
      <p className="mt-3 text-base leading-7 text-muted">{principle.description}</p>
    </article>
  );
}
