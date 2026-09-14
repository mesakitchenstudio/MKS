"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import type { RecipeSeriesLink } from "@/lib/series-types";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function RecipeSeriesContext({ links }: { links: RecipeSeriesLink[] }) {
  if (!links.length) return null;
  const primary = links[0];

  function onCollectionClick(link: RecipeSeriesLink) {
    trackEvent("series_item_click", {
      series_id: link.id,
      series_slug: link.slug,
      source: "recipe_hero_collection",
    });
  }

  return (
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
      Part of{" "}
      <Link
        href={`/series/${primary.slug}`}
        className={`inline-flex min-h-11 items-center text-terracotta hover:underline ${linkFocus}`}
        onClick={() => onCollectionClick(primary)}
      >
        {primary.shortTitle || primary.title}
      </Link>
      {links.length > 1 ? (
        <>
          {" · "}
          {links.slice(1).map((link, index) => (
            <span key={link.slug}>
              {index > 0 ? ", " : ""}
              <Link
                href={`/series/${link.slug}`}
                className={`inline-flex min-h-11 items-center text-terracotta hover:underline ${linkFocus}`}
                onClick={() => onCollectionClick(link)}
              >
                {link.shortTitle || link.title}
              </Link>
            </span>
          ))}
        </>
      ) : null}
    </p>
  );
}
