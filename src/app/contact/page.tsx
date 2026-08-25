import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Write to ${site.name}.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-14 md:grid-cols-2 md:px-6">
      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Contact
        </p>
        <h1 className="mt-2 font-serif text-5xl">Say hello</h1>
        <p className="mt-4 leading-8 text-muted">
          Recipe questions, partnership notes, or something you cooked from the studio —
          we read it. For the fastest reply, include the recipe name.
        </p>
        <p className="mt-6 text-sm">
          Email{" "}
          <a href={`mailto:${site.email}`} className="font-semibold text-terracotta">
            {site.email}
          </a>
        </p>
      </div>
      <ContactForm />
    </div>
  );
}
