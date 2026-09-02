import type { Metadata } from "next";
import Link from "next/link";
import { HomepageBrowseCategories } from "@/components/HomepageBrowseCategories";
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
  const [featuredRecipeSlug, fromKitchenSlugs] = await Promise.all([
    getHomepageFeaturedRecipeSlug(),
    getHomepageFromKitchenRecipeSlugs(),
  ]);
  const homepage = resolveHomepage(recipes, {
    featuredRecipeSlug,
    fromKitchenSlugs,
  });

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:gap-10 md:px-6 md:py-14 lg:py-16">
          <div className="order-1">
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
            <div className="order-2">
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

      <HomepageBrowseCategories />

      {homepageConfig.fromKitchen.enabled && homepage.fromKitchen.length === 3 ? (
        <HomepageFromKitchenSection
          title={homepageConfig.fromKitchen.title}
          recipes={homepage.fromKitchen}
        />
      ) : null}

      <section className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-16">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              The studio
            </p>
            <h2 className="mt-3 font-serif text-4xl">A small kitchen, tested recipes</h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted">
              Mesa Kitchen Studio is a test kitchen for home cooks. We measure, test, adjust, and
              explain recipes so the method is something you can repeat in your own kitchen.
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
