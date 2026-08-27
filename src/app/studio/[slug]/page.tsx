import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lessons } from "@/data/lessons";
import { getAllRecipes } from "@/lib/recipes";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return lessons.map((lesson) => ({ slug: lesson.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lesson = lessons.find((item) => item.slug === slug);
  if (!lesson) return { title: "Lesson" };
  return { title: lesson.title, description: lesson.excerpt };
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params;
  const lesson = lessons.find((item) => item.slug === slug);
  if (!lesson) notFound();

  const relatedSlugs = lesson.relatedRecipeSlugs || [];
  const related =
    relatedSlugs.length === 0
      ? []
      : (await getAllRecipes()).filter((recipe) => relatedSlugs.includes(recipe.slug));

  return (
    <article className="mx-auto max-w-2xl px-4 py-12 md:px-0">
      <Link href="/studio" className="text-sm font-semibold text-terracotta">
        ← All lessons
      </Link>
      <h1 className="mt-4 font-serif text-4xl md:text-5xl">{lesson.title}</h1>
      <p className="mt-4 text-lg leading-8 text-muted">{lesson.excerpt}</p>
      <div className="prose-mesa mt-8 text-base leading-8">
        {lesson.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {related.length > 0 ? (
        <aside className="mt-12 border-t border-line pt-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            Cook with this
          </p>
          <ul className="mt-4 space-y-2">
            {related.map((recipe) => (
              <li key={recipe.slug}>
                <Link
                  href={`/recipes/${recipe.slug}`}
                  className="font-serif text-xl text-ink hover:text-terracotta"
                >
                  {recipe.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}
