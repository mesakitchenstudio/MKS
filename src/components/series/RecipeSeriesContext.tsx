import Link from "next/link";
import type { RecipeSeriesLink } from "@/lib/series-types";

export function RecipeSeriesContext({ links }: { links: RecipeSeriesLink[] }) {
  if (!links.length) return null;
  const primary = links[0];

  return (
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
      Part of{" "}
      <Link
        href={`/series/${primary.slug}`}
        className="text-terracotta hover:underline"
      >
        {primary.shortTitle || primary.title}
      </Link>
      {links.length > 1 ? (
        <>
          {" · "}
          {links.slice(1).map((link, index) => (
            <span key={link.slug}>
              {index > 0 ? ", " : ""}
              <Link href={`/series/${link.slug}`} className="text-terracotta hover:underline">
                {link.shortTitle || link.title}
              </Link>
            </span>
          ))}
        </>
      ) : null}
    </p>
  );
}
