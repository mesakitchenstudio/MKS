import Link from "next/link";
import type { Lesson } from "@/data/types";
import { STUDIO_LESSON_CATEGORY, lessonHref } from "@/data/lessons";
import { StudioLinkArrow, studioCardLinkClass } from "./studio-link";

export function StudioLessonTeaser({
  lesson,
  number,
}: {
  lesson: Lesson;
  number: number;
}) {
  return (
    <Link href={lessonHref(lesson.slug)} className={studioCardLinkClass}>
      <article className="flex h-full w-full flex-col">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-olive/70">
          {String(number).padStart(2, "0")}
        </p>
        <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
          {STUDIO_LESSON_CATEGORY}
        </p>
        <h3 className="mt-2 font-serif text-xl leading-snug text-ink transition-colors duration-150 group-hover:text-terracotta group-focus-visible:text-terracotta md:text-[1.35rem]">
          {lesson.title}
        </h3>
        <p className="mt-3 flex-1 text-sm leading-6 text-muted">{lesson.excerpt}</p>
        <span className="mt-5 inline-flex items-center text-sm text-muted underline-offset-4 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-terracotta group-hover:underline group-focus-visible:text-terracotta motion-reduce:transform-none">
          Read the lesson
          <StudioLinkArrow />
        </span>
      </article>
    </Link>
  );
}
