import type { Metadata } from "next";
import Image from "next/image";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Coming soon",
  description: `${site.name} is still in the studio. Recipes for the table, soon.`,
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png" }],
  },
};

const socials = [
  { label: "YouTube", href: site.social.youtube },
  { label: "Instagram", href: site.social.instagram },
  { label: "Pinterest", href: site.social.pinterest },
];

export default function ComingSoonPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(22rem,0.95fr)_1.15fr]">
      <section className="relative flex flex-col justify-between bg-paper px-8 py-10 md:px-14 md:py-14 lg:px-16 lg:py-16">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-olive">
            {site.name}
          </p>
          <div className="mt-16 md:mt-24">
            <p className="font-serif text-6xl leading-none tracking-tight text-ink md:text-7xl">
              Mesa
            </p>
            <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-terracotta">
              Kitchen Studio
            </p>
            <span className="mt-8 block h-px w-16 bg-terracotta" />
            <h1 className="mt-8 max-w-sm font-serif text-3xl leading-tight text-ink md:text-[2.35rem]">
              The table is being set.
            </h1>
            <p className="mt-5 max-w-md text-base leading-8 text-muted">
              We are testing recipes in a real kitchen — cakes, weeknight plates, and
              the small sauces that finish a meal. The site opens when every dish is
              ready to cook from.
            </p>
          </div>
        </div>

        <div className="mt-14">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-olive">
            Meanwhile
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            {socials.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-ink/80 underline-offset-4 hover:text-terracotta hover:underline"
              >
                {item.label}
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">{site.tagline}</p>
        </div>
      </section>

      <section className="relative min-h-[22rem] lg:min-h-dvh">
        <Image
          src="https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=1800&q=80"
          alt="A rustic peach cobbler on a marble table"
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-ink/10 lg:bg-gradient-to-l lg:from-transparent lg:via-transparent lg:to-ink/15" />
        <p className="absolute bottom-6 left-6 font-serif text-lg text-paper/90 md:bottom-10 md:left-10">
          Opening soon
        </p>
      </section>
    </div>
  );
}
