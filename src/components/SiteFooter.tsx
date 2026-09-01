import Link from "next/link";
import { site } from "@/data/site";
import { Logo } from "./Logo";
import { NewsletterForm } from "./NewsletterForm";
import { buildRecipesUrl } from "@/lib/recipe-discovery";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
} from "@/lib/recipe-primary-taxonomy";

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-line bg-ink text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="md:col-span-1">
          <Logo className="[&_span:first-child]:text-cream [&_span:last-child]:text-sand" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-sand/80">{site.tagline}</p>
        </div>

        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sand">
            Explore
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {PRIMARY_CATEGORY_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  href={buildRecipesUrl({ category: slug })}
                  className="hover:text-terracotta"
                >
                  {PRIMARY_CATEGORY_LABELS[slug]}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sand">
            Site
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/about" className="hover:text-terracotta">
                About
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-terracotta">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-terracotta">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/disclosures" className="hover:text-terracotta">
                Disclosures
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sand">
            Newsletter
          </p>
          <p className="mt-3 mb-4 text-sm leading-6 text-sand/80">
            New recipes and seasonal notes, sent when we have something worth the inbox.
          </p>
          <NewsletterForm tone="dark" />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-sand/70 md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <div className="flex gap-4">
            <a href={site.social.instagram} className="hover:text-cream">
              Instagram
            </a>
            <a href={site.social.pinterest} className="hover:text-cream">
              Pinterest
            </a>
            <a href={site.social.youtube} className="hover:text-cream">
              YouTube
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
