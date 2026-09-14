import Image from "next/image";
import Link from "next/link";
import { formatCollectionContentCount } from "@/lib/series-collection-count";

export type CollectionCardModel = {
  id: string;
  slug: string;
  title: string;
  description: string;
  heroImage: string;
  itemCount: number;
  recipeCount: number;
  videoCount: number;
};

/**
 * Shared public Collection card for /series index and Related Collections.
 */
export function CollectionCard({
  collection,
  titleAs = "h2",
}: {
  collection: CollectionCardModel;
  titleAs?: "h2" | "h3";
}) {
  const href = `/series/${collection.slug}`;
  const countLabel = formatCollectionContentCount({
    recipeCount: collection.recipeCount,
    videoCount: collection.videoCount,
    itemCount: collection.itemCount,
  });
  const TitleTag = titleAs;

  return (
    <article className="flex flex-col border border-line bg-paper">
      <Link
        href={href}
        className="relative aspect-video overflow-hidden bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        <Image
          src={collection.heroImage}
          alt=""
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw"
        />
      </Link>
      <div className="flex flex-1 flex-col px-4 py-5">
        <TitleTag className="font-serif text-2xl text-ink">
          <Link
            href={href}
            className="hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            {collection.title}
          </Link>
        </TitleTag>
        {collection.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{collection.description}</p>
        ) : null}
        {countLabel ? <p className="mt-3 text-xs text-muted">{countLabel}</p> : null}
        <Link
          href={href}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Explore collection →
        </Link>
      </div>
    </article>
  );
}
