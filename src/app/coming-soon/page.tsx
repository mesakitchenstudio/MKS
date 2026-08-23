import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Coming soon",
  description: `${site.name} is still in the studio. Recipes for the table, soon.`,
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-20 text-center">
      <p className="font-serif text-4xl tracking-tight text-ink md:text-5xl">Mesa</p>
      <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-olive">
        Kitchen Studio
      </p>
      <h1 className="mt-10 max-w-xl font-serif text-3xl leading-tight text-ink md:text-4xl">
        We’re still in the studio.
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-muted">
        Recipes for the table are being tested and written. The site will open when
        they are ready to cook from.
      </p>
      <p className="mt-8 text-sm text-muted">
        {site.tagline}
      </p>
    </div>
  );
}
