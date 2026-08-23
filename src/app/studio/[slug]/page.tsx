import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lessons } from "@/data/lessons";

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
    </article>
  );
}
