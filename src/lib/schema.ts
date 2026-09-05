import { site } from "@/data/site";
import type { Recipe } from "@/data/types";
import { publicNutritionJsonLdFields } from "@/lib/field-content";
import { countedHeatMinutes, isoDuration, totalMinutes } from "@/lib/recipe-utils";
import type { RecipeReviewStats } from "@/lib/recipe-reviews";
import { isSchemaVideoId } from "@/lib/recipe-youtube";

const logoUrl = `${site.url}/icon.png`;

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: site.name,
    alternateName: ["Mesa Kitchen", site.shortName],
    url: site.url,
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
    },
    image: logoUrl,
    description: site.description,
    email: site.email,
    sameAs: Object.values(site.social).filter(Boolean),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: site.name,
    alternateName: ["Mesa Kitchen", site.shortName],
    url: site.url,
    description: site.description,
    publisher: { "@id": `${site.url}/#organization` },
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${site.url}/recipes?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Combined graph for the sitewide layout — helps Google connect brand + site. */
export function siteGraphJsonLd() {
  const organization = organizationJsonLd();
  const website = websiteJsonLd();
  const { "@context": _orgContext, ...orgNode } = organization;
  const { "@context": _siteContext, ...siteNode } = website;
  return {
    "@context": "https://schema.org",
    "@graph": [orgNode, siteNode],
  };
}

export function recipeJsonLd(recipe: Recipe, reviewStats?: RecipeReviewStats) {
  // DEFERRED SEO/schema identity: Recipe `name` stays on canonical `recipe.title`
  // even when the public H1 uses editorial dishName. Revisit with meta/OG policy.
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.excerpt,
    image: [recipe.image],
    url: `${site.url}/recipes/${recipe.slug}`,
    mainEntityOfPage: `${site.url}/recipes/${recipe.slug}`,
    author: {
      "@type": "Organization",
      "@id": `${site.url}/#organization`,
      name: site.name,
      url: site.url,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${site.url}/#organization`,
      name: site.name,
      logo: {
        "@type": "ImageObject",
        url: logoUrl,
      },
    },
    datePublished: recipe.publishedAt,
    dateModified: recipe.updatedAt,
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(countedHeatMinutes(recipe)),
    totalTime: isoDuration(totalMinutes(recipe)),
    recipeYield: `${recipe.servings} ${recipe.servingsUnit}`,
    recipeCategory: recipe.course,
    recipeCuisine: recipe.cuisine,
    keywords: [...recipe.tags, site.name].filter(Boolean).join(", "),
    recipeIngredient: recipe.ingredients.flatMap((group) =>
      group.items.map((item) =>
        [item.amount, item.item, item.notes ? `(${item.notes})` : ""]
          .filter(Boolean)
          .join(" "),
      ),
    ),
    recipeInstructions: recipe.instructions.flatMap((group) =>
      group.steps.map((step, index) => ({
        "@type": "HowToStep",
        name: group.name ? `${group.name} ${index + 1}` : `Step ${index + 1}`,
        text: step,
      })),
    ),
  };

  const nutritionFields = publicNutritionJsonLdFields(recipe.nutrition);
  if (nutritionFields) {
    data.nutrition = {
      "@type": "NutritionInformation",
      ...nutritionFields,
    };
  }

  if (reviewStats?.count) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviewStats.average,
      reviewCount: reviewStats.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const videoUrl = recipe.youtubeUrl?.trim();
  if (videoUrl && isSchemaVideoId(videoUrl)) {
    data.video = {
      "@type": "VideoObject",
      name: recipe.youtube?.title || recipe.title,
      description: recipe.youtube?.hook || recipe.excerpt,
      thumbnailUrl: recipe.youtube?.thumbnail,
      uploadDate: recipe.publishedAt,
      contentUrl: videoUrl,
      embedUrl: videoUrl.includes("embed") ? videoUrl : undefined,
    };
  }

  return data;
}
