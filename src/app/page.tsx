import type { Metadata } from "next";
import Link from "next/link";
import { CollectionRow } from "@/components/CollectionRow";
import { HomepageHero } from "@/components/HomepageHero";
import { HomepageLatestSection } from "@/components/HomepageLatestSection";
import { NewsletterForm } from "@/components/NewsletterForm";
import { site } from "@/data/site";
import { homepageConfig } from "@/data/homepage";
import { resolveHomepage } from "@/lib/homepage";
import { getAllRecipes } from "@/lib/recipes";

export const revalidate = 300;

export const metadata: Metadata = {
  title: {
    absolute: `${site.name} | ${site.tagline}`,
  },
  description: `${site.name} — ${site.description}`,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${site.name} | ${site.tagline}`,
    description: `${site.name} — ${site.description}`,
    url: site.url,
  },
};

const heroLinkFocus =
  "rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export default async function Home() {
  const recipes = await getAllRecipes();
  const homepage = resolveHomepage(recipes, homepageConfig);

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-16 lg:py-18">
          <div className="order-1">
            <h1 className="max-w-xl font-serif text-5xl leading-[1.1] md:text-6xl">
              {site.name}
            </h1>
            <p className="mt-4 max-w-xl font-serif text-2xl leading-snug text-sand md:text-3xl">
              {site.tagline}
            </p>
            <p className="mt-5 max-w-md text-base leading-7 text-sand/85">
              Foolproof recipes, tested in a real kitchen, written so you know why they
              work — then you can sit down and eat.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/recipes"
                className={`rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-paper hover:bg-terracotta-dark ${heroLinkFocus}`}
              >
                Browse recipes
              </Link>
              <Link
                href="/studio"
                className={`rounded-full border border-sand/40 px-6 py-3 text-sm font-semibold text-cream hover:border-cream ${heroLinkFocus}`}
              >
                Studio lessons
              </Link>
            </div>
          </div>
          {homepage.hero ? (
            <div className="order-2">
              <HomepageHero recipe={homepage.hero} eyebrow={homepage.heroEyebrow} />
            </div>
          ) : null}
        </div>
      </section>

      {homepageConfig.latest.enabled && homepage.latest.length ? (
        <HomepageLatestSection
          title={homepageConfig.latest.title}
          href={homepageConfig.latest.href}
          viewMoreLabel={homepageConfig.latest.viewMoreLabel}
          recipes={homepage.latest}
        />
      ) : null}

      {homepage.collections.map((collection) => {
        const row = (
          <CollectionRow
            key={collection.id}
            title={collection.title}
            description={collection.description}
            href={collection.href}
            viewMoreLabel={collection.viewMoreLabel}
            recipes={collection.recipes}
          />
        );
        if (collection.tone === "sand") {
          return (
            <section key={collection.id} className="bg-sand/40">
              {row}
            </section>
          );
        }
        return row;
      })}

      <section className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              The studio
            </p>
            <h2 className="mt-3 font-serif text-4xl">A small kitchen, tested recipes</h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted">
              Mesa Kitchen Studio is a recipe studio for home cooks. We write the way we
              cook: measure twice, taste as you go, and leave the table a little fuller
              than you found it.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-block rounded-sm text-sm font-semibold text-terracotta hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              More about us →
            </Link>
          </div>
          <div className="border border-line bg-cream p-8">
            <h3 className="font-serif text-2xl">Never miss a recipe</h3>
            <p className="mt-2 mb-5 text-sm leading-6 text-muted">
              Seasonal cooking notes and new studio recipes, when we have them.
            </p>
            <NewsletterForm />
          </div>
        </div>
      </section>
    </>
  );
}
