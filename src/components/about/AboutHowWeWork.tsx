import { ABOUT_PRINCIPLES } from "@/data/about";
import { AboutPrincipleItem } from "./AboutPrincipleItem";

export function AboutHowWeWork() {
  return (
    <section className="border-y border-line bg-sand/40 py-14 md:py-16" aria-labelledby="about-how-we-work">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          How we work
        </p>
        <h2 id="about-how-we-work" className="mt-3 max-w-2xl text-balance font-serif text-3xl leading-tight text-ink md:text-4xl">
          Recipes tested like lessons
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
          We develop recipes the way a good teacher writes a lesson: say what to do, then say why
          it works. Every dish is cooked more than once, in a real home kitchen, with grocery-store
          ingredients and ordinary pans. If a method is fussy, we simplify it. If a flavor is quiet,
          we find the missing pinch of salt.
        </p>
        <ul className="mt-10 grid items-start gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {ABOUT_PRINCIPLES.map((principle) => (
            <li key={principle.number} className="h-full">
              <AboutPrincipleItem principle={principle} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
