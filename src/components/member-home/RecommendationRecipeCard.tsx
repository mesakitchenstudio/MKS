import type { ReactNode } from "react";
import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { authFocusRing } from "@/lib/auth-ui";

/**
 * Thin wrapper: recommendation reason + existing RecipeGridCard.
 * Reason is visible and aria-describedby-linked to the card link for SR order.
 */
export function RecommendationRecipeCard({
  recipe,
  reasonLabel,
}: {
  recipe: Recipe;
  reasonLabel: string;
}) {
  const reasonId = `member-home-rec-reason-${recipe.slug}`;
  return (
    <li className="flex h-full min-w-0 flex-col">
      <p id={reasonId} className="mb-2 break-words text-xs leading-5 text-muted">
        {reasonLabel}
      </p>
      <div className="min-h-0 min-w-0 flex-1">
        <RecipeGridCard recipe={recipe} variant="discovery" ariaDescribedBy={reasonId} />
      </div>
    </li>
  );
}

export function MemberHomeRecipeShelf({
  recipes,
  labelledBy,
}: {
  recipes: Recipe[];
  labelledBy: string;
}) {
  return (
    <ul
      aria-labelledby={labelledBy}
      className="mt-6 grid list-none gap-8 sm:grid-cols-2 lg:grid-cols-4"
    >
      {recipes.map((recipe) => (
        <li key={recipe.slug} className="min-w-0">
          <RecipeGridCard recipe={recipe} variant="discovery" />
        </li>
      ))}
    </ul>
  );
}

export function MemberHomeTextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-sm text-sm font-semibold text-terracotta transition-colors hover:text-terracotta-dark ${authFocusRing}`}
    >
      {children}
    </Link>
  );
}

export function MemberHomeButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 ${authFocusRing}`}
    >
      {children}
    </Link>
  );
}
