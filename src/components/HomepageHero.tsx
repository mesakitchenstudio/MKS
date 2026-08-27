import Link from "next/link";
import { RecipeImage } from "@/components/RecipeImage";
import type { Recipe } from "@/data/types";

const linkFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function HomepageHero({
  recipe,
  eyebrow,
}: {
  recipe: Recipe;
  eyebrow: string;
}) {
  return (
    <Link
      href={`/recipes/${recipe.slug}`}
      className={`group relative mt-10 block md:mt-0 ${linkFocus}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden md:aspect-[5/6]">
        <RecipeImage
          src={recipe.image}
          alt={recipe.imageAlt}
          priority
          sizes="(min-width: 768px) 40vw, 100vw"
          className="object-cover transition duration-700 motion-safe:group-hover:scale-[1.03]"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sand">{eyebrow}</p>
        <p className="mt-1 font-serif text-2xl">{recipe.title}</p>
      </div>
    </Link>
  );
}
