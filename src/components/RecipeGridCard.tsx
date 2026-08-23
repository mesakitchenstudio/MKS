import Image from "next/image";
import Link from "next/link";
import type { Recipe } from "@/data/types";
import { formatTime } from "@/lib/recipe-utils";

export function RecipeGridCard({
  recipe,
  large = false,
}: {
  recipe: Recipe;
  large?: boolean;
}) {
  return (
    <Link href={`/recipes/${recipe.slug}`} className="group block">
      <article>
        <div
          className={`relative overflow-hidden bg-sand ${large ? "aspect-[4/3]" : "aspect-[5/4]"}`}
        >
          <Image
            src={recipe.image}
            alt={recipe.imageAlt}
            fill
            sizes={large ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        </div>
        <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
          {recipe.course}
        </p>
        <h3
          className={`mt-1 font-serif leading-tight text-ink group-hover:text-terracotta ${large ? "text-2xl md:text-3xl" : "text-xl"}`}
        >
          {recipe.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">{recipe.excerpt}</p>
        <p className="mt-2 text-xs text-muted">
          {formatTime(recipe.prepMinutes + recipe.cookMinutes)} · {recipe.servings}{" "}
          {recipe.servingsUnit}
        </p>
      </article>
    </Link>
  );
}
