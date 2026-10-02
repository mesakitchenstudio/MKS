import Link from "next/link";

/**
 * Nested Newsletter Admin tabs — Subscribers vs Campaigns stay distinct.
 */
export function NewsletterAdminSubnav({
  active,
  showSubscribers,
  showCampaigns,
}: {
  active: "subscribers" | "campaigns";
  showSubscribers: boolean;
  showCampaigns: boolean;
}) {
  if (!showSubscribers && !showCampaigns) return null;
  if (showSubscribers && !showCampaigns && active === "subscribers") return null;
  if (!showSubscribers && showCampaigns && active === "campaigns") return null;

  const itemClass = (isActive: boolean) =>
    `text-sm font-semibold ${
      isActive ? "text-ink underline decoration-2 underline-offset-8" : "text-muted hover:text-ink"
    }`;

  return (
    <nav aria-label="Newsletter sections" className="mb-6 flex flex-wrap items-center gap-4">
      {showSubscribers ? (
        <Link
          href="/admin/newsletter"
          className={itemClass(active === "subscribers")}
          aria-current={active === "subscribers" ? "page" : undefined}
        >
          Subscribers
        </Link>
      ) : null}
      {showCampaigns ? (
        <Link
          href="/admin/newsletter/campaigns"
          className={itemClass(active === "campaigns")}
          aria-current={active === "campaigns" ? "page" : undefined}
        >
          Campaigns
        </Link>
      ) : null}
    </nav>
  );
}
