import type { Metadata } from "next";
import Link from "next/link";
import { NewsletterUnsubscribeBeacon } from "@/components/NewsletterUnsubscribeBeacon";
import { unsubscribeNewsletterByToken } from "@/lib/newsletter-subscribe";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function NewsletterUnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const result = raw?.trim()
    ? await unsubscribeNewsletterByToken(raw)
    : ({ ok: false as const, reason: "invalid" as const });

  let heading = "We couldn’t process that unsubscribe link.";
  let body =
    "The link may be incomplete or no longer valid. If you still receive studio notes, reply to that email and we’ll help.";
  let beaconStatus: "unsubscribed" | "already" | "invalid" = "invalid";

  if (result.ok && result.alreadyUnsubscribed) {
    heading = "You’re already unsubscribed.";
    body = "We won’t send further newsletter emails to this address.";
    beaconStatus = "already";
  } else if (result.ok) {
    heading = "You’ve been unsubscribed.";
    body = "We won’t send further newsletter emails to this address.";
    beaconStatus = "unsubscribed";
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16 md:px-0">
      <NewsletterUnsubscribeBeacon status={beaconStatus} />
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Newsletter</p>
      <h1 className="mt-3 font-serif text-3xl leading-snug text-ink md:text-4xl">{heading}</h1>
      <p className="mt-4 text-base leading-7 text-muted">{body}</p>
      <p className="mt-8">
        <Link
          href="/"
          className="text-sm font-semibold text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          Return to Mesa →
        </Link>
      </p>
    </div>
  );
}
