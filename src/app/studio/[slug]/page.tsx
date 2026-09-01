import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioRelatedRecipes } from "@/components/studio/StudioRelatedRecipes";
import { getLessonBySlug, lessons } from "@/data/lessons";
import { getAllRecipes } from "@/lib/recipes";
import { getRelatedRecipesForLesson } from "@/lib/studio-recipe-links";
import { studioLessonTypeLabel } from "@/lib/studio-types";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return lessons.map((lesson) => ({ slug: lesson.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) return { title: "Lesson" };
  return { title: lesson.title, description: lesson.excerpt };
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) notFound();

  const related = await getRelatedRecipesForLesson(slug, await getAllRecipes());

  return (
    <article className="mx-auto max-w-2xl px-4 py-12 md:px-0">
      <Link
        href="/studio"
        className="rounded-sm text-sm font-semibold text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        ← All lessons
      </Link>
      <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
        {studioLessonTypeLabel(lesson.type)}
      </p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">{lesson.title}</h1>
      <p className="mt-4 text-lg leading-8 text-muted">{lesson.excerpt}</p>
      <div className="prose-mesa mt-8 text-base leading-8">
        {lesson.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <StudioRelatedRecipes recipes={related} />
    </article>
  );
}
