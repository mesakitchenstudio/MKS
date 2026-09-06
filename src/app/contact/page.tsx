import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Write to ${site.name} about recipes, partnerships, or studio feedback.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-14 md:grid-cols-2 md:gap-16 md:px-6 md:py-16 lg:gap-20">
      <div className="min-w-0">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Contact
        </p>
        <h1 className="mt-2 font-serif text-5xl leading-tight text-ink">Say hello</h1>
        <p className="mt-5 max-w-md text-base leading-8 text-muted">
          Recipe questions, partnership notes, or something you cooked from the studio —
          we read it.
        </p>
        <p className="mt-3 max-w-md text-base leading-8 text-muted">
          For recipe questions, including the recipe name helps us reply more quickly.
        </p>

        <div className="mt-10 space-y-6 border-t border-line pt-8">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
              Recipe questions
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">
              Tell us which recipe you&apos;re making and where you got stuck.
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
              Partnerships &amp; press
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">
              For collaborations, media requests, or studio enquiries.
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
              Corrections &amp; feedback
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">
              Spotted something that could be clearer? We&apos;d like to know.
            </p>
          </div>
        </div>

        <p className="mt-10 text-sm leading-7 text-muted">
          Email{" "}
          <a
            href={`mailto:${site.email}`}
            className="break-all font-semibold text-terracotta transition-colors hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            {site.email}
          </a>
        </p>
      </div>

      <div className="min-w-0 md:pt-1">
        <ContactForm />
      </div>
    </div>
  );
}
