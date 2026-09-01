import Link from "next/link";
import Image from "next/image";
import type { StudioRecipeLinkRow } from "@/lib/studio-types";

export function StudioRelatedRecipes({ recipes }: { recipes: StudioRecipeLinkRow[] }) {
  if (!recipes.length) return null;

  return (
    <aside className="mt-12 border-t border-line pt-8">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Put this into practice
      </p>
      <ul className="mt-4 space-y-4">
        {recipes.map((recipe) => (
          <li key={recipe.slug}>
            <Link
              href={`/recipes/${recipe.slug}`}
              className="group flex items-center gap-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-sand">
                <Image
                  src={recipe.image}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <span className="font-serif text-xl text-ink transition-colors group-hover:text-terracotta">
                {recipe.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
