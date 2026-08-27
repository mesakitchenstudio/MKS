import { VisitorsTable } from "@/components/admin/VisitorsTable";
import { requireAccess } from "@/lib/auth";
import {
  getVisitorAudienceSummary,
  listGuestsForAdmin,
  listPopularGuestPaths,
} from "@/lib/guest-analytics";
import { getAllRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function AdminVisitorsPage() {
  await requireAccess("members");
  const [visitors, popularPaths, summary, recipes] = await Promise.all([
    listGuestsForAdmin(),
    listPopularGuestPaths(),
    getVisitorAudienceSummary(),
    getAllRecipes(),
  ]);

  const recipeTitles = Object.fromEntries(recipes.map((recipe) => [recipe.slug, recipe.title]));

  return (
    <div>
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Visitors
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Anonymous visitor activity. Signed-in members are excluded.
      </p>

      <VisitorsTable
        visitors={visitors}
        popularPaths={popularPaths}
        summary={summary}
        recipeTitles={recipeTitles}
      />
    </div>
  );
}
