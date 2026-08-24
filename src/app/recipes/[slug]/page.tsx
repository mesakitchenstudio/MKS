import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionRow } from "@/components/CollectionRow";
import { JsonLd } from "@/components/JsonLd";
import { RecipeCard } from "@/components/RecipeCard";
import { SetCurrentRecipe } from "@/components/RecipeFloatTools";
import { RecipeTableOfContents } from "@/components/RecipeTableOfContents";
import { RecipeVideo } from "@/components/RecipeVideo";
import { ShareButtons } from "@/components/ShareButtons";
import { recipeTocItems } from "@/lib/recipe-sections";
import { recipeJsonLd } from "@/lib/schema";
import { getAllRecipes, getRecipeBySlug, getRelatedRecipes } from "@/lib/recipes";
import { youtubeVideoId } from "@/lib/youtube";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const recipes = await getAllRecipes();
  return recipes.map((recipe) => ({ slug: recipe.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) return { title: "Recipe" };

  return {
    title: recipe.title,
    description: recipe.excerpt,
    openGraph: {
      title: recipe.title,
      description: recipe.excerpt,
      images: [recipe.image],
      type: "article",
    },
  };
}

export default async function RecipePage({ params }: Props) {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const related = await getRelatedRecipes(recipe);
  const toc = recipeTocItems(recipe);
  const updated = new Date(recipe.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const hasVideo = Boolean(recipe.youtubeUrl && youtubeVideoId(recipe.youtubeUrl));

  return (
    <article>
      <SetCurrentRecipe slug={recipe.slug} title={recipe.title} />
      <JsonLd data={recipeJsonLd(recipe)} />

      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          {recipe.course} · {recipe.cuisine}
        </p>

        <h1 className="mt-3 font-serif text-5xl leading-tight text-ink">{recipe.title}</h1>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <p className="text-sm text-muted">Updated {updated}</p>
          <div className="flex flex-wrap items-center gap-4">
            <ShareButtons title={recipe.title} slug={recipe.slug} />
            <a
              href="#recipe-card"
              className="no-print rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark"
            >
              Jump to recipe
            </a>
          </div>
        </div>

        {recipe.excerpt ? (
          <p className="mt-8 text-lg leading-8 text-ink/90">{recipe.excerpt}</p>
        ) : null}

        {recipe.intro ? (
          <div className="prose-mesa mt-4 text-base leading-8 text-ink/90">
            <p>{recipe.intro}</p>
          </div>
        ) : null}

        <figure className="mt-8 overflow-hidden border border-line bg-sand">
          <div className="relative aspect-[4/3] w-full">
            <Image
              src={recipe.image}
              alt={recipe.imageAlt}
              fill
              priority
              sizes="(min-width: 768px) 48rem, 100vw"
              className="object-cover"
            />
          </div>
        </figure>

        {hasVideo && recipe.youtubeUrl ? (
          <RecipeVideo url={recipe.youtubeUrl} title={recipe.title} />
        ) : null}

        <RecipeTableOfContents items={toc} />

        {recipe.whyItWorks ? (
          <section id="why-this-works" className="mt-12 scroll-mt-24">
            <h2 className="font-serif text-3xl">Why this works</h2>
            <p className="mt-4 leading-8 text-ink/90">{recipe.whyItWorks}</p>
          </section>
        ) : null}

        {recipe.keyIngredients.length ? (
          <section id="key-ingredients" className="mt-12 scroll-mt-24">
            <h2 className="font-serif text-3xl">Key ingredients</h2>
            <dl className="mt-5 space-y-5">
              {recipe.keyIngredients.map((item) => (
                <div key={item.name} className="border-l-2 border-terracotta/70 pl-4">
                  <dt className="font-semibold">{item.name}</dt>
                  <dd className="mt-1 text-sm leading-6 text-muted">{item.note}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {recipe.tips.length ? (
          <section id="studio-tips" className="mt-12 scroll-mt-24">
            <h2 className="font-serif text-3xl">Studio tips</h2>
            <ul className="mt-5 space-y-3">
              {recipe.tips.map((tip) => (
                <li key={tip} className="leading-7 text-ink/90">
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <RecipeCard recipe={recipe} />
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-10 md:px-6">
        {recipe.faqs.length ? (
          <section id="faqs" className="mt-2 scroll-mt-24">
            <h2 className="font-serif text-3xl">Frequently asked</h2>
            <div className="mt-5 space-y-6">
              {recipe.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold">{faq.question}</h3>
                  <p className="mt-1 leading-7 text-muted">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {recipe.extras?.length ? (
          <section className="mt-12">
            {recipe.extras.map((field) => (
              <div
                key={field.key}
                id={`extra-${field.key}`}
                className="mt-10 scroll-mt-24 first:mt-0"
              >
                <h2 className="font-serif text-3xl">{field.label}</h2>
                <ExtraValue kind={field.kind} value={field.value} />
              </div>
            ))}
          </section>
        ) : null}

        <p className="mt-10 text-sm text-muted">
          Filed under{" "}
          {recipe.categories.map((category, index) => (
            <span key={category}>
              {index > 0 ? ", " : ""}
              <Link href={`/category/${category}`} className="text-terracotta hover:underline">
                {category.replace(/-/g, " ")}
              </Link>
            </span>
          ))}
          .
        </p>
      </div>

      <CollectionRow title="More from the studio" recipes={related} />
    </article>
  );
}

function ExtraValue({ kind, value }: { kind: string; value: unknown }) {
  if (value == null || value === "") return null;
  if (kind === "boolean") return <p className="mt-4 text-muted">{value ? "Yes" : "No"}</p>;
  if (kind === "image" && typeof value === "string") {
    return (
      <div className="relative mt-4 h-48 w-full overflow-hidden bg-sand">
        <Image src={value} alt="" fill className="object-cover" sizes="40vw" />
      </div>
    );
  }
  if ((kind === "gallery" || kind === "list" || kind === "tags") && Array.isArray(value)) {
    return (
      <ul className="mt-4 list-disc space-y-1 pl-5 text-muted">
        {value.map((item) => (
          <li key={String(item)}>{String(item)}</li>
        ))}
      </ul>
    );
  }
  return <p className="mt-4 leading-7 text-muted">{String(value)}</p>;
}
