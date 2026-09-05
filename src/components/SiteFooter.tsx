import Link from "next/link";
import { site } from "@/data/site";
import { Logo } from "./Logo";
import { NewsletterForm } from "./NewsletterForm";
import { buildRecipesUrl } from "@/lib/recipe-discovery";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
} from "@/lib/recipe-primary-taxonomy";

const footerLinkClass =
  "rounded-sm text-cream/90 transition-colors hover:text-terracotta hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const socialLinkClass =
  "rounded-sm transition-colors hover:text-cream hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const FOOTER_SITE_LINKS = [
  { href: "/about", label: "About" },
  { href: "/videos", label: "Videos" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/disclosures", label: "Disclosures" },
] as const;

export function SiteFooter({ hideNewsletter = false }: { hideNewsletter?: boolean }) {
  return (
    <footer className="no-print mt-auto border-t border-line bg-ink text-cream">
      <div
        className={`mx-auto grid max-w-6xl gap-8 px-4 py-11 sm:grid-cols-2 md:px-6 lg:gap-x-10 lg:gap-y-8 ${
          hideNewsletter
            ? "md:grid-cols-[1.2fr_0.9fr_0.9fr]"
            : "md:grid-cols-[1.2fr_0.8fr_0.8fr_minmax(0,1.35fr)]"
        }`}
      >
        <div className="sm:col-span-2 md:col-span-1">
          <Logo className="[&_span:first-child]:text-cream [&_span:last-child]:text-sand" />
          <p className="mt-3 max-w-[16.5rem] text-sm leading-6 text-sand/80">{site.tagline}</p>
        </div>

        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sand">
            Explore
          </p>
          <ul className="mt-2.5 space-y-1.5 text-sm">
            {PRIMARY_CATEGORY_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={buildRecipesUrl({ category: slug })} className={footerLinkClass}>
                  {PRIMARY_CATEGORY_LABELS[slug]}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sand">Site</p>
          <ul className="mt-2.5 space-y-1.5 text-sm">
            {FOOTER_SITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {hideNewsletter ? null : (
          <div className="sm:col-span-2 md:col-span-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sand">
              Newsletter
            </p>
            <p className="mt-2.5 mb-3 max-w-sm text-sm leading-6 text-sand/80">
              New recipes and seasonal notes, sent when we have something worth the inbox.
            </p>
            <NewsletterForm tone="dark" />
          </div>
        )}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-4 py-4 text-xs text-sand/70 md:flex-row md:items-center md:justify-between md:px-6">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href={site.social.instagram} className={socialLinkClass}>
              Instagram
            </a>
            <a href={site.social.pinterest} className={socialLinkClass}>
              Pinterest
            </a>
            <a href={site.social.youtube} className={socialLinkClass}>
              YouTube
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
