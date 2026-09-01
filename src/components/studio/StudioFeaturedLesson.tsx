import Link from "next/link";
import type { Lesson } from "@/data/types";
import { lessonHref } from "@/data/lessons";
import { studioLessonTypeLabel } from "@/lib/studio-types";
import { StudioLinkArrow, studioCardLinkClass } from "./studio-link";
import { StudioMeasureVisual } from "./StudioMeasureVisual";

export function StudioFeaturedLesson({ lesson }: { lesson: Lesson }) {
  const href = lessonHref(lesson.slug);

  return (
    <section className="mt-6 md:mt-8" aria-labelledby="studio-featured-lesson">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10 lg:gap-12">
        <div className="shrink-0 md:pt-1">
          <StudioMeasureVisual />
        </div>
        <Link href={href} className={`min-w-0 flex-1 md:max-w-lg md:pt-2 lg:pt-3 ${studioCardLinkClass}`}>
          <article>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-olive/70">
              01
            </p>
            <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
              {studioLessonTypeLabel(lesson.type)}
            </p>
            <h2
              id="studio-featured-lesson"
              className="mt-2 font-serif text-3xl leading-tight text-ink transition-colors duration-150 group-hover:text-terracotta group-focus-visible:text-terracotta md:text-4xl"
            >
              {lesson.title}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted">{lesson.excerpt}</p>
            <span
              aria-hidden
              className="mt-5 inline-flex items-center text-sm text-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-terracotta group-focus-visible:text-terracotta motion-reduce:transform-none"
            >
              <StudioLinkArrow />
            </span>
          </article>
        </Link>
      </div>
    </section>
  );
}
