import Link from "next/link";
import type { NewsletterCampaignAdminListItem } from "@/lib/newsletter-campaign-admin";

function formatWhen(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NewsletterCampaignList({
  campaigns,
  canCompose,
}: {
  campaigns: NewsletterCampaignAdminListItem[];
  canCompose: boolean;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-sm border border-line bg-cream/20 px-4 py-8 text-center">
        <p className="text-sm text-ink">No newsletter campaigns yet.</p>
        {canCompose ? (
          <p className="mt-3">
            <Link
              href="/admin/newsletter/campaigns/new"
              className="inline-flex rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-paper hover:bg-ink/90"
            >
              Create campaign
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] table-fixed text-left text-sm">
        <caption className="sr-only">Newsletter campaigns</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="w-[32%] py-2 pr-3 font-semibold">
              Name
            </th>
            <th scope="col" className="w-[14%] py-2 pr-3 font-semibold">
              Status
            </th>
            <th scope="col" className="w-[28%] py-2 pr-3 font-semibold">
              Subject
            </th>
            <th scope="col" className="w-[14%] py-2 pr-3 font-semibold">
              Updated
            </th>
            <th scope="col" className="w-[12%] py-2 font-semibold">
              Sent
            </th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((row) => (
            <tr key={row.id} className="border-b border-line/70 align-top">
              <td className="py-3 pr-3">
                <Link
                  href={`/admin/newsletter/campaigns/${row.id}`}
                  className="break-words font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {row.name}
                </Link>
              </td>
              <td className="py-3 pr-3">
                <span
                  className={
                    row.status === "sending"
                      ? "font-semibold text-terracotta"
                      : row.status === "sent"
                        ? "font-semibold text-ink"
                        : "capitalize text-muted"
                  }
                >
                  {row.status === "sending"
                    ? "Sending"
                    : row.status === "sent"
                      ? "Sent"
                      : row.status}
                </span>
              </td>
              <td className="break-words py-3 pr-3 text-muted">
                {row.subject.trim() || "—"}
              </td>
              <td className="py-3 pr-3 text-muted">{formatWhen(row.updatedAt)}</td>
              <td className="py-3 text-muted">{formatWhen(row.sentAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
