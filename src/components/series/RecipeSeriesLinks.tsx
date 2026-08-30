import Link from "next/link";
import type { RecipeSeriesLink } from "@/lib/series-types";

export function RecipeSeriesLinks({ links }: { links: RecipeSeriesLink[] }) {
  if (!links.length) return null;
  const primary = links[0];
  const next = primary.nextItem;

  return (
    <section className="mt-10 border border-line bg-cream/40 px-4 py-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Part of</p>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {links.map((link) => (
          <li key={link.slug}>
            <Link href={`/series/${link.slug}`} className="font-semibold text-terracotta hover:underline">
              {link.shortTitle || link.title}
            </Link>
          </li>
        ))}
      </ul>
      {next?.recipeSlug ? (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            Next in {primary.shortTitle || primary.title}
          </p>
          <p className="mt-1 font-semibold text-ink">{next.title}</p>
          <Link
            href={`/recipes/${next.recipeSlug}`}
            className="mt-2 inline-flex text-sm font-semibold text-terracotta hover:underline"
          >
            View recipe →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
