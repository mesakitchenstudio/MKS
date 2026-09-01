"use client";

import Link from "next/link";
import type { Lesson } from "@/data/types";
import { lessonHref } from "@/data/lessons";
import { studioLessonTypeLabel } from "@/lib/studio-types";
import { studioCardLinkClass } from "./studio-link";
import { StudioLinkArrow } from "./studio-link";

export function StudioLessonTeaser({
  lesson,
  number,
}: {
  lesson: Lesson;
  number: number;
}) {
  return (
    <Link
      href={lessonHref(lesson.slug)}
      className={studioCardLinkClass}
      aria-label={lesson.title}
    >
      <article className="flex h-full w-full flex-col">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-olive/70">
          {String(number).padStart(2, "0")}
        </p>
        <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
          {studioLessonTypeLabel(lesson.type)}
        </p>
        <h3 className="mt-2 font-serif text-xl leading-snug text-ink transition-colors duration-150 group-hover:text-terracotta group-focus-visible:text-terracotta md:text-[1.35rem]">
          {lesson.title}
        </h3>
        <p className="mt-3 flex-1 text-sm leading-6 text-muted">{lesson.excerpt}</p>
        <span
          aria-hidden
          className="mt-5 inline-flex items-center text-sm text-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-terracotta group-focus-visible:text-terracotta motion-reduce:transform-none"
        >
          <StudioLinkArrow />
        </span>
      </article>
    </Link>
  );
}
