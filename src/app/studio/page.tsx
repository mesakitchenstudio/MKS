import type { Metadata } from "next";
import { StudioFeaturedLesson } from "@/components/studio/StudioFeaturedLesson";
import { StudioFromSection } from "@/components/studio/StudioFromSection";
import { StudioLessonTeaser } from "@/components/studio/StudioLessonTeaser";
import { lessons, partitionStudioLessons } from "@/data/lessons";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Studio lessons",
  description: `Kitchen fundamentals from ${site.name} — measuring, butter, ovens, and mise en place.`,
  alternates: { canonical: "/studio" },
};

export default function StudioPage() {
  const { featured, notes } = partitionStudioLessons(lessons);

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-10 md:px-6 md:pt-10">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          The studio
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">Lessons from the bench</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
          Practical lessons from our kitchen — techniques, ingredients, equipment, and habits that
          make everyday cooking more reliable.
        </p>

        <StudioFeaturedLesson lesson={featured} />

        <section
          className="mt-8 pb-10 md:mt-10 md:pb-12"
          aria-labelledby="studio-notes-heading"
        >
          <h2 id="studio-notes-heading" className="font-serif text-3xl text-ink md:text-4xl">
            Studio notes
          </h2>
          <ul className="mt-5 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((lesson, index) => (
              <li key={lesson.slug} className="flex min-h-0">
                <StudioLessonTeaser lesson={lesson} number={index + 2} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <StudioFromSection />
    </>
  );
}
