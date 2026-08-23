import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "About",
  description: `The story behind ${site.name} — a small recipe studio for the table.`,
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-0">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        About
      </p>
      <h1 className="mt-2 font-serif text-5xl">A studio for the table</h1>
      <div className="prose-mesa mt-8 text-lg leading-8 text-ink/90">
        <p>
          Mesa means the table. It is also the warm stone of the desert — a place where
          people gather, pass plates, and stay a little longer than they meant to. Mesa
          Kitchen Studio started as a working kitchen with that picture in mind.
        </p>
        <p>
          We develop recipes the way a good teacher writes a lesson: say what to do, then
          say why it works. Every dish is cooked more than once, in a real home kitchen,
          with grocery-store ingredients and ordinary pans. If a method is fussy, we
          simplify it. If a flavor is quiet, we find the missing pinch of salt.
        </p>
        <p>
          You will find cakes and cookies next to chile, tortillas, and a jar of salsa
          verde. That mix is the point. The studio is for weeknights and weekends, for
          the person who wants a reliable roast and the person who wants a lemon bar that
          actually tastes like lemon.
        </p>
        <p>
          This is the first chapter of the site. The recipes will grow. The standard will
          not: if it is here, it should work in your kitchen.
        </p>
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/recipes"
          className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-paper"
        >
          Browse recipes
        </Link>
        <Link
          href="/contact"
          className="rounded-full border border-line px-6 py-3 text-sm font-semibold"
        >
          Write to us
        </Link>
      </div>
    </div>
  );
}
