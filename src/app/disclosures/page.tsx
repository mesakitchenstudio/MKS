import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Disclosures",
};

export default function DisclosuresPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-0">
      <h1 className="font-serif text-5xl">Disclosures</h1>
      <div className="prose-mesa mt-8 text-base leading-8 text-muted">
        <p>
          {site.name} publishes original recipes and technique notes. Nutrition figures
          are estimates generated from standard ingredient data and will vary with brands
          and portion size.
        </p>
        <p>
          If we ever recommend a product we were paid to mention, or earn a commission
          from a link, we will say so on that page. Today the catalog contains no
          affiliate links and no sponsored recipes.
        </p>
        <p>
          Food photography on this launch site includes licensed stock images used as
          stand-ins until the studio’s own photographs are in place.
        </p>
      </div>
    </div>
  );
}
