import type { Metadata } from "next";
import Link from "next/link";
import { NewsletterUnsubscribeBeacon } from "@/components/NewsletterUnsubscribeBeacon";
import { site } from "@/data/site";
import { unsubscribeNewsletterByToken } from "@/lib/newsletter-subscribe";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const primaryCtaClass = `inline-flex min-h-11 w-full items-center justify-center rounded-md bg-terracotta px-6 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark sm:w-auto ${focusRing}`;

const secondaryLinkClass = `inline-flex min-h-11 items-center text-sm font-semibold text-terracotta transition-colors hover:text-terracotta-dark hover:underline ${focusRing}`;

export default async function NewsletterUnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const result = raw?.trim()
    ? await unsubscribeNewsletterByToken(raw)
    : ({ ok: false as const, reason: "invalid" as const });

  let heading = "We couldn’t process that unsubscribe link.";
  let body = "The link may be invalid or no longer available.";
  let beaconStatus: "unsubscribed" | "already" | "invalid" = "invalid";

  if (result.ok && result.alreadyUnsubscribed) {
    heading = "You’re already unsubscribed.";
    body = "This address is no longer subscribed to Mesa newsletter emails.";
    beaconStatus = "already";
  } else if (result.ok) {
    heading = "You’ve been unsubscribed.";
    body = "We won’t send further newsletter emails to this address.";
    beaconStatus = "unsubscribed";
  }

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col items-center justify-center bg-cream px-4 py-12 sm:px-5 sm:py-16">
      <NewsletterUnsubscribeBeacon status={beaconStatus} />
      <div className="w-full max-w-[34rem] border border-line bg-paper px-6 py-10 sm:px-10 sm:py-12">
        <p className="text-[0.8rem] font-semibold uppercase tracking-[0.2em] text-olive">Mesa</p>
        <p className="mt-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-olive">
          Kitchen Studio
        </p>

        <p className="mt-8 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Newsletter
        </p>

        <h1 className="mt-3 font-serif text-[2rem] leading-snug text-ink sm:text-[2.25rem]">
          {heading}
        </h1>

        <p className="mt-4 max-w-prose text-base leading-7 text-muted">{body}</p>

        <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-start">
          <Link href="/" className={primaryCtaClass}>
            Return to Mesa →
          </Link>
          <Link href="/recipes" className={secondaryLinkClass}>
            Browse recipes →
          </Link>
        </div>

        <div className="mt-10 border-t border-line pt-6">
          <p className="font-serif text-sm italic leading-relaxed text-muted">{site.tagline}</p>
        </div>
      </div>
    </div>
  );
}
