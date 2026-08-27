import type { Metadata } from "next";
import { AboutClosing } from "@/components/about/AboutClosing";
import { AboutHowWeWork } from "@/components/about/AboutHowWeWork";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: `About ${site.name}`,
  description: `The story behind ${site.name} — a small recipe studio for the table. Studio-tested recipes for gathering around the table.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-12 md:px-6 md:pt-14">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">About</p>
        <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">About {site.name}</h1>
        <p className="mt-4 font-serif text-xl leading-snug text-muted md:text-2xl">
          A studio for the table
        </p>

        <section
          className="mt-10 grid gap-6 md:mt-14 md:grid-cols-2 md:items-center md:gap-12 lg:gap-16"
          aria-labelledby="about-origin"
        >
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              Why Mesa
            </p>
            <p
              id="about-origin"
              className="mt-3 text-balance font-serif text-3xl leading-tight text-ink md:text-4xl lg:text-[2.75rem] lg:leading-[1.15]"
            >
              Mesa means the table.
            </p>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted md:text-lg md:leading-8">
            It is also the warm stone of the desert — a place where people gather, pass plates, and
            stay a little longer than they meant to. Mesa Kitchen Studio started as a working kitchen
            with that picture in mind.
          </p>
        </section>
      </div>

      <div className="mt-12 md:mt-16">
        <AboutHowWeWork />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
        <section
          className="grid gap-6 md:grid-cols-2 md:items-center md:gap-12 lg:grid-cols-[45fr_55fr] lg:gap-16"
          aria-labelledby="about-at-the-table"
        >
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              At the table
            </p>
            <h2
              id="about-at-the-table"
              className="mt-3 text-balance font-serif text-3xl leading-tight text-ink md:text-4xl"
            >
              Weeknights, weekends, and everything between
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted md:text-lg md:leading-8">
            You will find cakes and cookies next to chile, tortillas, and a jar of salsa verde. That
            mix is the point. The studio is for weeknights and weekends, for the person who wants a
            reliable roast and the person who wants a lemon bar that actually tastes like lemon.
          </p>
        </section>
      </div>

      <AboutClosing />
    </>
  );
}
