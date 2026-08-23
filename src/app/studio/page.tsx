import type { Metadata } from "next";
import Link from "next/link";
import { lessons } from "@/data/lessons";

export const metadata: Metadata = {
  title: "Studio lessons",
  description:
    "Kitchen fundamentals from Mesa Kitchen Studio — measuring, butter, ovens, and mise en place.",
};

export default function StudioPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        The studio
      </p>
      <h1 className="mt-2 font-serif text-5xl">Lessons from the bench</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
        Short technique notes we wish every home cook had before the first bake. Read one
        before you start a recipe; it will save you a tray of cookies.
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {lessons.map((lesson) => (
          <Link
            key={lesson.slug}
            href={`/studio/${lesson.slug}`}
            className="group border border-line bg-paper p-8 hover:border-terracotta"
          >
            <h2 className="font-serif text-2xl group-hover:text-terracotta">{lesson.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{lesson.excerpt}</p>
            <p className="mt-5 text-sm font-semibold text-terracotta">Read the lesson →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
