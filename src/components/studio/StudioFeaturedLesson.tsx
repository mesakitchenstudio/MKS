import Link from "next/link";
import type { Lesson } from "@/data/types";
import { STUDIO_LESSON_CATEGORY, lessonHref } from "@/data/lessons";
import {
  StudioLinkArrow,
  studioTextLinkClass,
  studioTitleLinkClass,
} from "./studio-link";
import { StudioMeasureVisual } from "./StudioMeasureVisual";

export function StudioFeaturedLesson({ lesson }: { lesson: Lesson }) {
  const href = lessonHref(lesson.slug);

  return (
    <section className="mt-8 md:mt-10" aria-labelledby="studio-featured-lesson">
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-12 lg:gap-14">
        <div className="shrink-0">
          <StudioMeasureVisual />
        </div>
        <div className="min-w-0 flex-1 md:max-w-lg md:pt-3 lg:pt-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-olive/70">
            01
          </p>
          <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
            {STUDIO_LESSON_CATEGORY}
          </p>
          <h2
            id="studio-featured-lesson"
            className="mt-2 font-serif text-3xl leading-tight text-ink md:text-4xl"
          >
            <Link href={href} className={studioTitleLinkClass}>
              {lesson.title}
            </Link>
          </h2>
          <p className="mt-4 text-base leading-7 text-muted">{lesson.excerpt}</p>
          <Link href={href} className={`mt-5 ${studioTextLinkClass}`}>
            Read the lesson
            <StudioLinkArrow />
          </Link>
        </div>
      </div>
    </section>
  );
}
