import type { Metadata } from "next";
import Image from "next/image";
import { AboutClosing } from "@/components/about/AboutClosing";
import { AboutHowWeWork } from "@/components/about/AboutHowWeWork";
import { AboutStudioMoment } from "@/components/about/AboutStudioMoment";
import { ABOUT_HERO_IMAGE } from "@/data/about";
import { site } from "@/data/site";
import { loadPublicVideoCatalogue } from "@/lib/public-videos/load";
import type { PublicVideoCard } from "@/lib/public-videos/types";

export const metadata: Metadata = {
  title: `About ${site.name}`,
  description: `${site.name} publishes carefully tested home-cooking and baking recipes using everyday ingredients — with instructions that explain what to do and, when useful, why it works.`,
  alternates: { canonical: "/about" },
};

export const revalidate = 300;

export default async function AboutPage() {
  const catalogue = await loadPublicVideoCatalogue();
  const studioVideo: PublicVideoCard | null =
    catalogue.ok && catalogue.featured ? catalogue.featured : null;
  const heroImage = ABOUT_HERO_IMAGE;

  return (
    <>
      <header className="mx-auto max-w-6xl px-4 pt-10 md:px-6 md:pt-12">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">About</p>
        <h1 className="mt-2 max-w-3xl text-balance font-serif text-4xl leading-tight text-ink md:text-5xl md:leading-[1.1]">
          A studio for the table.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
          Mesa Kitchen Studio publishes carefully tested home-cooking and baking recipes using
          everyday ingredients. The instructions tell you what to do — and, when it helps, why it
          works.
        </p>
        {heroImage ? (
          <div className="relative mt-8 aspect-[21/9] overflow-hidden bg-sand md:mt-10">
            <Image
              src={heroImage.src}
              alt={heroImage.alt}
              fill
              priority
              className="object-cover"
              sizes="(min-width: 768px) 72rem, 100vw"
            />
          </div>
        ) : null}
      </header>

      <section
        className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14"
        aria-labelledby="about-origin"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Why Mesa
        </p>
        <h2
          id="about-origin"
          className="mt-3 max-w-xl text-balance font-serif text-3xl leading-tight text-ink md:text-4xl"
        >
          Mesa means the table.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted md:mt-6 md:text-lg md:leading-8">
          It is also the warm stone of the desert — a place to gather, pass plates, and linger. The
          studio began as a working kitchen with that picture in mind.
        </p>
      </section>

      <AboutHowWeWork />

      <section
        className="border-b border-line"
        aria-labelledby="about-at-the-table"
      >
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <div className="md:grid md:grid-cols-12 md:gap-10 lg:gap-14">
            <div className="md:col-span-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
                At the table
              </p>
              <h2
                id="about-at-the-table"
                className="mt-3 text-balance font-serif text-3xl leading-tight text-ink md:text-4xl"
              >
                Weeknights, weekends, and everything between.
              </h2>
            </div>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted md:col-span-7 md:mt-10 md:text-lg md:leading-8 lg:col-span-6 lg:col-start-7">
              You will find cakes and cookies next to chile, tortillas, and a jar of salsa verde.
              That mix is the point — reliable weeknight cooking beside the lemon bar that actually
              tastes like lemon.
            </p>
          </div>
        </div>
      </section>

      <AboutStudioMoment video={studioVideo} />

      <AboutClosing />
    </>
  );
}
