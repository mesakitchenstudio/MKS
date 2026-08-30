import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { CollectionRow } from "@/components/CollectionRow";
import { JumpToRecipeLink } from "@/components/JumpToRecipeLink";
import { JsonLd } from "@/components/JsonLd";
import { RecipeCard } from "@/components/RecipeCard";
import { SetCurrentRecipe } from "@/components/RecipeFloatTools";
import { RecipeRatingSummary } from "@/components/RecipeRatingSummary";
import { RecipeReviews } from "@/components/RecipeReviews";
import { RecipeTableOfContents } from "@/components/RecipeTableOfContents";
import { ShareButtons } from "@/components/ShareButtons";
import { RecipeMainEmbed } from "@/components/youtube/RecipeMainEmbed";
import { RecipeVideoCTA } from "@/components/youtube/RecipeVideoCTA";
import { RecipeVideoExperience } from "@/components/youtube/RecipeVideoExperience";
import { RelatedYouTubeVideos } from "@/components/youtube/RelatedYouTubeVideos";
import { YouTubeSubscribeCTA } from "@/components/youtube/YouTubeSubscribeCTA";
import { site } from "@/data/site";
import { getAdminSession } from "@/lib/auth";
import { canManageRecipeReviewReplies, getRecipeReviewData } from "@/lib/recipe-reviews";
import { resolveRecipeYoutube, resolveRecipeYoutubeForDisplay } from "@/lib/recipe-youtube";
import { recipeTocItems } from "@/lib/recipe-sections";
import { fieldValueHasContent } from "@/lib/field-content";
import { readerExtraLabel, visibleExtras } from "@/lib/recipe-timing";
import { recipeJsonLd } from "@/lib/schema";
import { formatGmtDisplay } from "@/lib/datetime";
import { getAllRecipes, getRecipeBySlug, getRelatedRecipes } from "@/lib/recipes";
import { getWatchNextRecommendation } from "@/lib/youtube-data/watch-next";
import { getSeriesLinksForRecipeSlug } from "@/lib/series";
import { RecipeSeriesLinks } from "@/components/series/RecipeSeriesLinks";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

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
    alternates: {
      canonical: `/recipes/${recipe.slug}`,
    },
    openGraph: {
      title: `${recipe.title} | ${site.name}`,
      description: recipe.excerpt,
      url: `${site.url}/recipes/${recipe.slug}`,
      images: [recipe.image],
      type: "article",
      siteName: site.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${recipe.title} | ${site.name}`,
      description: recipe.excerpt,
      images: [recipe.image],
    },
  };
}

export default async function RecipePage({ params }: Props) {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const [related, session, admin, seriesLinks] = await Promise.all([
    getRelatedRecipes(recipe),
    auth(),
    getAdminSession(),
    getSeriesLinksForRecipeSlug(recipe.slug),
  ]);
  const canStaffReply =
    Boolean(admin && canManageRecipeReviewReplies(admin.role)) ||
    Boolean(session?.staffRole && canManageRecipeReviewReplies(session.staffRole));
  const reviewData = await getRecipeReviewData(slug, {
    canStaffReply,
    email: session?.user?.email ?? null,
    userId: session?.user?.id ?? null,
  });
  const toc = recipeTocItems(recipe);
  const visibleExtrasList = visibleExtras(recipe).filter((field) =>
    fieldValueHasContent(field.value, field.kind),
  );
  const updated = formatGmtDisplay(recipe.updatedAt);
  const baseYoutube = resolveRecipeYoutube(recipe);
  if (baseYoutube && !(baseYoutube.timestamps?.length ?? 0)) {
    await connection();
  }
  const youtube = await resolveRecipeYoutubeForDisplay(recipe);
  const watchNext = youtube
    ? await getWatchNextRecommendation({
        currentVideoId: youtube.videoId,
        currentRecipeSlug: recipe.slug,
        currentCategories: recipe.categories,
        curatedRelated: youtube.relatedVideos,
      })
    : null;

  const article = (
    <>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          {recipe.course} · {recipe.cuisine}
        </p>

        <h1 className="mt-3 font-serif text-5xl leading-tight text-ink">{recipe.title}</h1>
        <RecipeRatingSummary slug={recipe.slug} initial={reviewData.stats} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <p className="text-sm text-muted">Updated {updated}</p>
          <div className="flex flex-wrap items-center gap-4">
            <ShareButtons title={recipe.title} slug={recipe.slug} />
            <JumpToRecipeLink slug={recipe.slug} title={recipe.title} />
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
          <div className="relative aspect-video w-full">
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

        {youtube ? <RecipeVideoCTA /> : null}

        {youtube ? <RecipeMainEmbed /> : null}

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
        <RecipeCard recipe={recipe} youtube={youtube} />
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

        {visibleExtrasList.length ? (
          <section className="mt-12">
            {visibleExtrasList.map((field) => (
              <div
                key={field.key}
                id={`extra-${field.key}`}
                className="mt-10 scroll-mt-24 first:mt-0"
              >
                <h2 className="font-serif text-3xl">{readerExtraLabel(field.label, field.key)}</h2>
                <ExtraValue kind={field.kind} value={field.value} />
              </div>
            ))}
          </section>
        ) : null}

        <RecipeReviews
          slug={recipe.slug}
          title={recipe.title}
          initial={reviewData}
          defaultName={session?.user?.name ?? ""}
          defaultEmail={session?.user?.email ?? ""}
        />

        <RecipeSeriesLinks links={seriesLinks} />

        {youtube?.relatedVideos?.length ? (
          <RelatedYouTubeVideos
            videos={youtube.relatedVideos}
            recipeSlug={recipe.slug}
            recipeName={recipe.title}
            sourceVideoId={youtube.videoId}
          />
        ) : null}

        <YouTubeSubscribeCTA
          recipeSlug={recipe.slug}
          recipeName={recipe.title}
          videoId={youtube?.videoId}
          placement="end_of_recipe"
        />

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
    </>
  );

  return (
    <article>
      <SetCurrentRecipe slug={recipe.slug} title={recipe.title} />
      <JsonLd data={recipeJsonLd(recipe, reviewData.stats)} />
      {youtube ? (
        <RecipeVideoExperience
          youtube={youtube}
          recipeSlug={recipe.slug}
          recipeName={recipe.title}
          watchNext={watchNext}
        >
          {article}
        </RecipeVideoExperience>
      ) : (
        article
      )}
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
