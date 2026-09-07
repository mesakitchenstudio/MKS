import Link from "next/link";

export function RecipeEditorSubnav({
  recipeId,
  active,
}: {
  recipeId: string;
  active: "recipe" | "history";
}) {
  const base = `/admin/recipes/${recipeId}`;
  const itemClass = (isActive: boolean) =>
    `text-sm font-semibold ${
      isActive ? "text-ink underline decoration-2 underline-offset-8" : "text-muted hover:text-ink"
    }`;

  return (
    <nav aria-label="Recipe sections" className="flex items-center gap-4">
      <Link href={base} className={itemClass(active === "recipe")} aria-current={active === "recipe" ? "page" : undefined}>
        Recipe
      </Link>
      <Link
        href={`${base}/history`}
        className={itemClass(active === "history")}
        aria-current={active === "history" ? "page" : undefined}
      >
        History
      </Link>
    </nav>
  );
}
