import { ABOUT_PRINCIPLES, ABOUT_PROCESS_IMAGE } from "@/data/about";
import { AboutPrincipleItem } from "./AboutPrincipleItem";
import Image from "next/image";

export function AboutHowWeWork() {
  const processImage = ABOUT_PROCESS_IMAGE;

  return (
    <section
      className="border-y border-line bg-sand/40 py-10 md:py-14"
      aria-labelledby="about-how-we-work"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          How we work
        </p>
        <h2
          id="about-how-we-work"
          className="mt-3 max-w-2xl text-balance font-serif text-3xl leading-tight text-ink md:text-4xl"
        >
          Recipes tested like lessons.
        </h2>

        <div
          className={
            processImage
              ? "mt-8 grid gap-8 md:mt-10 md:grid-cols-2 md:items-start md:gap-12 lg:gap-16"
              : "mt-6 max-w-2xl md:mt-8"
          }
        >
          <p className="text-base leading-7 text-muted md:text-lg md:leading-8">
            We develop recipes the way a good teacher writes a lesson: say what to do, then say why
            it works. Every dish is cooked more than once, in a real home kitchen, with grocery-store
            ingredients and ordinary pans. If a method is fussy, we simplify it. If a flavor is quiet,
            we find the missing pinch of salt.
          </p>
          {processImage ? (
            <div className="relative aspect-[4/3] overflow-hidden bg-sand">
              <Image
                src={processImage.src}
                alt={processImage.alt}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 28rem, 100vw"
              />
            </div>
          ) : null}
        </div>

        <ul className="mt-10 grid items-start gap-x-10 gap-y-9 border-t border-line/80 pt-10 sm:grid-cols-2 lg:grid-cols-3 md:mt-12 md:pt-12">
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
