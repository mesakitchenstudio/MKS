import Image from "next/image";
import Link from "next/link";
import { CollectionRow } from "@/components/CollectionRow";
import { NewsletterForm } from "@/components/NewsletterForm";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { site } from "@/data/site";
import {
  getAllRecipes,
  getFeaturedRecipes,
  getRecipesByCategory,
  getSeasonalRecipes,
} from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [latest, seasonal, cookies, breakfast, dinners, all] = await Promise.all([
    getFeaturedRecipes(4),
    getSeasonalRecipes(4),
    getRecipesByCategory("desserts"),
    getRecipesByCategory("breakfast"),
    getRecipesByCategory("main-dishes"),
    getAllRecipes(),
  ]);
  const hero = all[0];

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <div className="mx-auto grid min-h-[34rem] max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
          <div>
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.22em] text-sand">
              {site.name}
            </p>
            <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[1.1] md:text-6xl">
              {site.tagline}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-sand/85">
              Foolproof recipes, tested in a real kitchen, written so you know why they
              work — then you can sit down and eat.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/recipes"
                className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-paper hover:bg-terracotta-dark"
              >
                Browse recipes
              </Link>
              <Link
                href="/studio"
                className="rounded-full border border-sand/40 px-6 py-3 text-sm font-semibold text-cream hover:border-cream"
              >
                Studio lessons
              </Link>
            </div>
          </div>
          {hero ? (
            <Link href={`/recipes/${hero.slug}`} className="group relative block">
              <div className="relative aspect-[4/5] overflow-hidden md:aspect-[5/6]">
                <Image
                  src={hero.image}
                  alt={hero.imageAlt}
                  fill
                  priority
                  sizes="(min-width: 768px) 40vw, 100vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.03]"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sand">
                  Latest from the studio
                </p>
                <p className="mt-1 font-serif text-2xl">{hero.title}</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-serif text-3xl md:text-4xl">Latest recipes</h2>
          <Link href="/recipes" className="text-sm font-semibold text-terracotta">
            View all
          </Link>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {latest.slice(0, 2).map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} large />
          ))}
        </div>
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {latest.slice(2).map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      </section>

      <section className="bg-sand/40">
        <CollectionRow title="Summer at the table" href="/category/summer" recipes={seasonal.slice(0, 4)} />
      </section>

      <CollectionRow title="Cookies and sweets" href="/category/desserts" recipes={cookies.slice(0, 4)} />
      <CollectionRow title="Best breakfast recipes" href="/category/breakfast" recipes={breakfast.slice(0, 4)} />
      <CollectionRow title="Easy dinner recipes" href="/category/main-dishes" recipes={dinners.slice(0, 4)} />

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
              className="mt-6 inline-block text-sm font-semibold text-terracotta hover:text-terracotta-dark"
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
