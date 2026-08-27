import type { Metadata } from "next";
import Image from "next/image";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";

const HOLDING_TITLE = `${site.name} | Recipes for the Table`;
const HOLDING_DESCRIPTION =
  "Thoughtful recipes for everyday cooking, baking, and the table. Mesa Kitchen Studio is opening soon.";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=1800&q=80";
const HERO_ALT = "A rustic peach cobbler in a skillet on a marble table";

const socialFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export const metadata: Metadata = {
  title: {
    absolute: HOLDING_TITLE,
  },
  description: HOLDING_DESCRIPTION,
  applicationName: site.name,
  alternates: {
    // While SITE_PRIVATE rewrites `/` here; when the full site is public, keep this path self-canonical.
    canonical: isSitePrivate() ? "/" : "/coming-soon",
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: HOLDING_TITLE,
    description: HOLDING_DESCRIPTION,
    url: isSitePrivate() ? site.url : `${site.url}/coming-soon`,
    siteName: site.name,
    locale: "en_US",
    type: "website",
    images: [
      {
        url: HERO_IMAGE,
        width: 1800,
        height: 1350,
        alt: HERO_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOLDING_TITLE,
    description: HOLDING_DESCRIPTION,
    images: [HERO_IMAGE],
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=mesa", sizes: "any" },
      { url: "/icon.png?v=mesa", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=mesa" }],
  },
};

const socials = [
  { label: "YouTube", href: site.social.youtube },
  { label: "Instagram", href: site.social.instagram },
  { label: "Pinterest", href: site.social.pinterest },
];

export default function ComingSoonPage() {
  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[minmax(20rem,0.9fr)_1.1fr] lg:overflow-hidden">
      <section className="relative flex flex-col justify-between bg-paper px-7 py-9 sm:px-10 sm:py-12 md:px-14 md:py-14 lg:overflow-y-auto lg:px-16 lg:py-16">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-olive">
            {site.name}
          </p>
          <div className="mt-10 sm:mt-14 md:mt-20 lg:mt-24">
            <p className="font-serif text-5xl leading-none tracking-tight text-ink sm:text-6xl md:text-7xl">
              Mesa
            </p>
            <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-terracotta">
              Kitchen Studio
            </p>
            <span className="mt-7 block h-px w-16 bg-terracotta sm:mt-8" aria-hidden />
            <h1 className="mt-7 max-w-sm font-serif text-[1.85rem] leading-tight text-ink sm:mt-8 sm:text-3xl md:text-[2.35rem]">
              The table is being set.
            </h1>
            <p className="mt-4 max-w-md text-[0.95rem] leading-7 text-muted sm:mt-5 sm:text-base sm:leading-8">
              We are testing recipes in a real kitchen — cakes, weeknight plates, and the small
              sauces that finish a meal. The site opens when every dish is ready to cook from.
            </p>
          </div>
        </div>

        <div className="mt-12 sm:mt-14">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-olive">
            Meanwhile
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            {socials.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-ink/80 underline-offset-4 transition-colors hover:text-terracotta hover:underline ${socialFocus}`}
              >
                {item.label}
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">{site.tagline}</p>
        </div>
      </section>

      <section className="relative h-[min(34rem,58dvh)] w-full sm:h-[min(38rem,60dvh)] lg:h-full lg:min-h-0">
        <Image
          src={HERO_IMAGE}
          alt={HERO_ALT}
          fill
          priority
          quality={82}
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="object-cover object-[center_42%]"
        />
        {/* Soft bottom veil only — keeps “Opening soon” legible without a badge */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/45 to-transparent sm:h-28"
          aria-hidden
        />
        <p className="absolute bottom-6 left-6 font-serif text-lg text-paper [text-shadow:0_1px_2px_rgba(42,34,24,0.7),0_2px_10px_rgba(42,34,24,0.28)] md:bottom-10 md:left-10">
          Opening soon
        </p>
      </section>
    </div>
  );
}
