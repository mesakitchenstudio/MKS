import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-0">
      <h1 className="font-serif text-5xl">Privacy policy</h1>
      <div className="prose-mesa mt-8 text-base leading-8 text-muted">
        <p>
          {site.name} respects your kitchen and your inbox. When you create an
          account we store your name, email, and the recipes you save so they
          appear on your profile. We also keep a record of how you signed in
          (Google or email), your IP address, and approximate location from the
          hosting provider so we can understand sign-ups and keep the site
          secure. We do not sell personal information.
        </p>
        <p>
          When you join the newsletter, we store your email so we can send recipes and studio notes
          you asked for. You may receive a short welcome message after signing up. You can
          unsubscribe at any time using the link in those emails.
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
