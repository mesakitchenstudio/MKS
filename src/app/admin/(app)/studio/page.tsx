import type { Metadata } from "next";
import Link from "next/link";
import { saveStudioLessonLinksAction } from "@/app/admin/actions";
import { HomepageCurationForm } from "@/components/admin/HomepageCurationForm";
import { lessons } from "@/data/lessons";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAllRecipes } from "@/lib/recipes";
import {
  getHomepageFeaturedRecipeSlug,
  getHomepageFromKitchenRecipeSlugs,
} from "@/lib/site-settings";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass } from "@/lib/admin-ui";
import { studioLessonTypeLabel } from "@/lib/studio-types";
import { lessonHref } from "@/data/lessons";

export const metadata: Metadata = {
  title: "Studio",
};
export const dynamic = "force-dynamic";

export default async function AdminStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; featuredSaved?: string }>;
}) {
  await requireAccess("content");
  const params = await searchParams;
  const db = getDb();
  const [publishedRecipes, links, featuredSlug, fromKitchenSlugs, fullRecipes] = await Promise.all([
    db.recipe.findMany({
      where: { status: "published" },
      select: { id: true, slug: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.studioLessonRecipeLink.findMany({
      select: { lessonSlug: true, recipeId: true },
      orderBy: [{ lessonSlug: "asc" }, { sortOrder: "asc" }],
    }),
    getHomepageFeaturedRecipeSlug(),
    getHomepageFromKitchenRecipeSlugs(),
    getAllRecipes(),
  ]);

  const linksByLesson = new Map<string, Set<string>>();
  for (const link of links) {
    const set = linksByLesson.get(link.lessonSlug) || new Set<string>();
    set.add(link.recipeId);
    linksByLesson.set(link.lessonSlug, set);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-ink">Studio</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Curate which published recipes connect to each Studio lesson. Links are manual — no
          automatic matching.
        </p>
      </div>

      {params.saved ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Studio recipe links saved.
        </p>
      ) : null}

      {params.featuredSaved ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Homepage curation saved.
        </p>
      ) : null}

      <HomepageCurationForm
        recipes={publishedRecipes}
        featuredSlug={featuredSlug}
        fromKitchenSlugs={fromKitchenSlugs}
        fullRecipes={fullRecipes}
      />

      <div className="space-y-6">
        {lessons.map((lesson) => {
          const selected = linksByLesson.get(lesson.slug) || new Set<string>();
          return (
            <section
              key={lesson.slug}
              className="rounded-sm border border-line bg-paper px-4 py-5"
              aria-labelledby={`admin-studio-${lesson.slug}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
                    {studioLessonTypeLabel(lesson.type)} · {lesson.status}
                  </p>
                  <h2 id={`admin-studio-${lesson.slug}`} className="mt-1 font-serif text-2xl text-ink">
                    {lesson.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">{lesson.excerpt}</p>
                </div>
                <Link href={lessonHref(lesson.slug)} className={`text-sm ${adminLinkClass}`}>
                  View lesson ↗
                </Link>
              </div>

              <form action={saveStudioLessonLinksAction} className="mt-5 space-y-3">
                <input type="hidden" name="lessonSlug" value={lesson.slug} />
                <fieldset>
                  <legend className="text-sm font-semibold text-ink">Related recipes</legend>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {publishedRecipes.length === 0 ? (
                      <li className="text-sm text-muted">No published recipes yet.</li>
                    ) : (
                      publishedRecipes.map((recipe) => (
                        <li key={recipe.id}>
                          <label className="flex items-start gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              name="recipeIds"
                              value={recipe.id}
                              defaultChecked={selected.has(recipe.id)}
                              className="mt-1"
                            />
                            <span>{recipe.title}</span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </fieldset>
                <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
                  Save links
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
