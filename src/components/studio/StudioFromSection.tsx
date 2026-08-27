import Link from "next/link";
import { StudioLinkArrow, studioTextLinkClass } from "./studio-link";

export function StudioFromSection() {
  return (
    <section className="border-t border-line bg-sand/40">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-2 md:items-start md:gap-x-12 md:px-6 md:py-11 lg:grid-cols-[45fr_55fr] lg:gap-x-16">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            From the studio
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-ink md:text-4xl">
            Good cooking is mostly repetition
          </h2>
        </div>
        <div className="md:pt-8">
          <p className="max-w-xl text-base leading-7 text-muted">
            We test recipes the way people actually cook: measuring twice, tasting as we go, and
            paying attention to the small details that make a recipe easier the next time.
          </p>
          <Link href="/about" className={`mt-5 ${studioTextLinkClass}`}>
            About the studio
            <StudioLinkArrow />
          </Link>
        </div>
      </div>
    </section>
  );
}
