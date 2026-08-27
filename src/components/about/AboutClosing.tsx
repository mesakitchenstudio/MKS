import Link from "next/link";

const buttonFocus =
  "rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function AboutClosing() {
  return (
    <section className="border-t border-line bg-sand/40 py-14 md:py-16" aria-labelledby="about-closing">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-2 md:items-center md:gap-x-12 md:px-6 lg:grid-cols-[55fr_45fr]">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            The standard
          </p>
          <h2 id="about-closing" className="mt-3 text-balance font-serif text-3xl leading-tight text-ink md:text-4xl">
            The recipes will grow.
            <br />
            The standard will not.
          </h2>
        </div>
        <div>
          <p className="text-base leading-7 text-muted md:text-lg md:leading-8">
            If it is here, it should work in your kitchen.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
            <Link
              href="/recipes"
              className={`rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-paper hover:bg-terracotta-dark ${buttonFocus}`}
            >
              Browse recipes
            </Link>
            <Link
              href="/contact"
              className={`rounded-full border border-line bg-paper px-6 py-3 text-sm font-semibold text-ink hover:border-terracotta ${buttonFocus}`}
            >
              Write to us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
