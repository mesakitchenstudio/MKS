import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Disclosures",
  description: `How ${site.name} approaches recipe testing, nutrition estimates, imagery, and commercial relationships.`,
  alternates: { canonical: "/disclosures" },
};

const sectionClass = "border-t border-line pt-8";
const headingClass = "font-serif text-2xl leading-snug text-ink md:text-[1.65rem]";
const bodyClass = "mt-3 space-y-4 text-base leading-8 text-muted";

export default function DisclosuresPage() {
  return (
    <div className="mx-auto max-w-[46rem] px-4 py-14 md:px-6 md:py-16">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Legal
      </p>
      <h1 className="mt-2 font-serif text-5xl leading-tight text-ink">Disclosures</h1>
      <p className="mt-5 text-base leading-8 text-muted">
        {site.name} aims to be clear about recipe testing, nutrition estimates, imagery,
        and any commercial relationships on the site.
      </p>
      <p className="mt-4 text-sm leading-6 text-muted">Last updated September 6, 2026</p>

      <div className="prose-mesa mt-12 space-y-10">
        <section className={sectionClass} aria-labelledby="disc-nutrition">
          <h2 id="disc-nutrition" className={headingClass}>
            Recipe testing &amp; nutrition
          </h2>
          <div className={bodyClass}>
            <p>
              {site.name} publishes original recipes and technique notes. Nutrition
              information, when provided, is labeled as an estimate. Figures may be entered
              by the studio or generated with assistance, and they can vary with brands,
              substitutions, and serving size.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="disc-affiliate">
          <h2 id="disc-affiliate" className={headingClass}>
            Affiliate links &amp; sponsorships
          </h2>
          <div className={bodyClass}>
            <p>
              Today the catalog contains no affiliate links and no sponsored recipes. If we
              ever recommend a product we were paid to mention, or earn a commission from a
              link, we will identify that on the relevant page.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="disc-photo">
          <h2 id="disc-photo" className={headingClass}>
            Photography
          </h2>
          <div className={bodyClass}>
            <p>
              Some images on the site may use licensed photography while Mesa&apos;s own
              studio photography is being completed. Where possible, recipes are updated
              with original studio images.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="disc-ads">
          <h2 id="disc-ads" className={headingClass}>
            Advertising
          </h2>
          <div className={bodyClass}>
            <p>
              The site is not currently displaying advertising. If advertising or sponsored
              placements are introduced, they will be identified appropriately.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="disc-contact">
          <h2 id="disc-contact" className={headingClass}>
            Contact
          </h2>
          <div className={bodyClass}>
            <p>
              Questions:{" "}
              <a
                href={`mailto:${site.email}`}
                className="break-all font-semibold text-terracotta transition-colors hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              >
                {site.email}
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
