import type { Metadata } from "next";
import Link from "next/link";
import { HomepageBrowseCategories } from "@/components/HomepageBrowseCategories";
import { HomepageFeaturedSeries } from "@/components/HomepageFeaturedSeries";
import { HomepageFromKitchenSection } from "@/components/HomepageFromKitchenSection";
import { HomepageHero } from "@/components/HomepageHero";
import { HomepageLatestSection } from "@/components/HomepageLatestSection";
import { NewsletterForm } from "@/components/NewsletterForm";
import { site } from "@/data/site";
import { homepageConfig } from "@/data/homepage";
import { resolveHomepage } from "@/lib/homepage";
import {
  getHomepageFeaturedRecipeSlug,
  getHomepageFromKitchenRecipeSlugs,
} from "@/lib/site-settings";
import { getAllRecipes } from "@/lib/recipes";
import { listPublishedSeries } from "@/lib/series";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Home",
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

const studioLinkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export default async function Home() {
  const recipes = await getAllRecipes();
  const [featuredRecipeSlug, fromKitchenSlugs, publishedSeries] = await Promise.all([
    getHomepageFeaturedRecipeSlug(),
    getHomepageFromKitchenRecipeSlugs(),
    listPublishedSeries(),
  ]);
  const homepage = resolveHomepage(recipes, {
    featuredRecipeSlug,
    fromKitchenSlugs,
  });
  const featuredSeries = publishedSeries[0] ?? null;

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] md:gap-8 md:px-6 md:py-11 lg:gap-10 lg:py-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="order-1 min-w-0">
            <h1 className="max-w-xl font-serif text-5xl leading-[1.1] md:text-6xl">
              Recipes for the table.
            </h1>
            <p className="mt-4 max-w-xl font-serif text-2xl leading-snug text-sand md:text-3xl">
              Tested in the studio.
            </p>
            <p className="mt-5 max-w-md text-base leading-7 text-sand/85">
              Recipes tested in a real kitchen, with clear methods and explanations so you know
              why they work.
            </p>
            <div className="mt-7">
              <Link
                href="/recipes"
                className={`rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-paper hover:bg-terracotta-dark ${heroLinkFocus}`}
              >
                Browse recipes
              </Link>
            </div>
          </div>
          {homepage.hero ? (
            <div className="order-2 min-w-0">
              <HomepageHero recipe={homepage.hero} eyebrow={homepage.heroEyebrow} />
            </div>
          ) : null}
        </div>
      </section>

      {homepageConfig.latest.enabled && homepage.latest.length >= 3 ? (
        <HomepageLatestSection
          title={homepageConfig.latest.title}
          href={homepageConfig.latest.href}
          viewMoreLabel={homepageConfig.latest.viewMoreLabel}
          recipes={homepage.latest}
        />
      ) : null}

      {featuredSeries ? <HomepageFeaturedSeries series={featuredSeries} /> : null}

      <HomepageBrowseCategories />

      {homepageConfig.fromKitchen.enabled && homepage.fromKitchen.length === 3 ? (
        <HomepageFromKitchenSection
          title={homepageConfig.fromKitchen.title}
          recipes={homepage.fromKitchen}
        />
      ) : null}

      <section className="border-y border-line bg-cream" aria-labelledby="studio-heading">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-14 md:grid-cols-2 md:gap-12 md:px-6 md:py-16">
          <div className="min-w-0 border-t border-line pt-8 md:border-t-0 md:pt-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              The studio
            </p>
            <h2 id="studio-heading" className="mt-3 font-serif text-4xl">
              A small kitchen, tested recipes
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted">
              Mesa Kitchen Studio is a test kitchen for home cooks. We measure, test, adjust, and
              explain recipes so the method is something you can repeat in your own kitchen.
            </p>
            <Link
              href="/about"
              className={`mt-6 inline-block text-sm font-semibold text-terracotta hover:text-terracotta-dark ${studioLinkFocus}`}
            >
              More about us →
            </Link>
          </div>
          <div className="min-w-0 border-t border-line pt-8">
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
