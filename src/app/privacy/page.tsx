import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-0">
      <h1 className="font-serif text-5xl">Privacy policy</h1>
      <div className="prose-mesa mt-8 text-base leading-8 text-muted">
        <p>
          {site.name} respects your kitchen and your inbox. This first version of the
          site stores newsletter signups in your browser only. We do not sell personal
          information.
        </p>
        <p>
          When we connect a real email service, we will use addresses solely to send
          recipes and studio notes you asked for. You can unsubscribe at any time.
        </p>
        <p>
          The site may use standard hosting logs and analytics to understand which pages
          work. Recipe pages include structured data so search engines can show cook
          times and ingredients.
        </p>
        <p>
          Questions:{" "}
          <a href={`mailto:${site.email}`} className="text-terracotta">
            {site.email}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
