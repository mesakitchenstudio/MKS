import Link from "next/link";
import {
  adminFocusRing,
  adminInputClass,
  adminTableHeadClass,
} from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";
import {
  emptyStateForNewsletterList,
  isNewsletterStatusActive,
  newsletterStatusLabel,
  type NewsletterAdminCounts,
  type NewsletterAdminListResult,
  type NewsletterAdminStatusFilter,
} from "@/lib/newsletter-admin";

function buildNewsletterHref(input: {
  status: NewsletterAdminStatusFilter;
  q: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.status !== "active") params.set("status", input.status);
  if (input.q) params.set("q", input.q);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const qs = params.toString();
  return qs ? `/admin/newsletter?${qs}` : "/admin/newsletter";
}

const chipBase = `rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${adminFocusRing}`;
const chipActive = "bg-sand text-ink";
const chipIdle = "text-muted hover:text-ink";

function StatusText({ status }: { status: string }) {
  const label = newsletterStatusLabel(status);
  if (isNewsletterStatusActive(status)) {
    return <span className="text-sm text-olive">{label}</span>;
  }
  return <span className="text-sm text-muted">{label}</span>;
}

function SummaryCounts({ counts }: { counts: NewsletterAdminCounts }) {
  const items: Array<{ label: string; value: number }> = [
    { label: "Active", value: counts.active },
    { label: "Unsubscribed", value: counts.unsubscribed },
    { label: "Total", value: counts.total },
    { label: "New in last 30 days", value: counts.newLast30Days },
  ];

  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-b border-line/80 pb-5">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-olive">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm tabular-nums text-ink">
            {item.value.toLocaleString("en-US")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function NewsletterSubscribersIndex({
  list,
  counts,
}: {
  list: NewsletterAdminListResult;
  counts: NewsletterAdminCounts;
}) {
  const emptyMessage = emptyStateForNewsletterList({
    status: list.status,
    q: list.q,
    total: list.total,
  });
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const showPagination = list.totalPages > 1;

  return (
    <div className="mt-2">
      <SummaryCounts counts={counts} />

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div
            className="flex flex-wrap gap-1 rounded-sm border border-line bg-cream/40 p-1"
            role="group"
            aria-label="Subscription status"
          >
            {(
              [
                ["active", "Active"],
                ["unsubscribed", "Unsubscribed"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={buildNewsletterHref({ status: value, q: list.q })}
                className={`${chipBase} ${list.status === value ? chipActive : chipIdle}`}
                aria-current={list.status === value ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </div>

          <form
            className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-sm"
            method="get"
            action="/admin/newsletter"
          >
            {list.status !== "active" ? (
              <input type="hidden" name="status" value={list.status} />
            ) : null}
            <label className="sr-only" htmlFor="newsletter-search">
              Search subscribers
            </label>
            <input
              id="newsletter-search"
              name="q"
              defaultValue={list.q}
              placeholder="Search subscribers…"
              className={`${adminInputClass} h-9 min-w-[12rem] flex-1 py-0`}
              autoComplete="off"
            />
            <button
              type="submit"
              className={`rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
            >
              Search
            </button>
          </form>
        </div>

        <p className="text-xs text-muted">
          Active means the address is saved and subscribed. Welcome-email delivery is separate.
        </p>

        {list.total > 0 ? (
          <p className="text-xs text-muted">
            {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of{" "}
            {list.total.toLocaleString("en-US")}
            {list.q ? " matching" : ""}
          </p>
        ) : null}

        <div className="hidden md:block">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[36%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className={adminTableHeadClass}>
              <tr className="border-b border-line/80">
                <th scope="col" className="px-0 py-3 font-medium">
                  Subscriber
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Source
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Joined
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Unsubscribed
                </th>
              </tr>
            </thead>
            <tbody>
              {emptyMessage ? (
                <tr>
                  <td colSpan={5} className="px-0 py-8 text-muted">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                list.rows.map((row) => (
                  <tr key={row.email} className="border-b border-line/80 align-middle">
                    <td className="px-0 py-3.5">
                      <span className="block break-all text-ink">{row.email}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusText status={row.status} />
                    </td>
                    <td className="px-3 py-3.5 text-muted">{row.source || "—"}</td>
                    <td className="px-3 py-3.5 text-muted">
                      {formatAdminDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-3.5 text-muted">
                      {row.unsubscribedAt ? formatAdminDate(row.unsubscribedAt) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <ul className="space-y-0 divide-y divide-line/80 border-t border-line/80 md:hidden">
          {emptyMessage ? (
            <li className="py-8 text-sm text-muted">{emptyMessage}</li>
          ) : (
            list.rows.map((row) => (
              <li key={row.email} className="py-4">
                <p className="break-all font-semibold text-ink">{row.email}</p>
                <p className="mt-1">
                  <StatusText status={row.status} />
                </p>
                <p className="mt-2 text-xs text-muted">
                  Joined {formatAdminDate(row.createdAt)}
                  <span className="mx-1.5 text-line" aria-hidden>
                    ·
                  </span>
                  {row.source || "—"}
                </p>
                {row.unsubscribedAt ? (
                  <p className="mt-1 text-xs text-muted">
                    Unsubscribed {formatAdminDate(row.unsubscribedAt)}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>

        {showPagination ? (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Pagination"
          >
            <p className="text-muted">
              Page {list.page} of {list.totalPages}
            </p>
            <div className="flex gap-2">
              {list.page > 1 ? (
                <Link
                  href={buildNewsletterHref({
                    status: list.status,
                    q: list.q,
                    page: list.page - 1,
                  })}
                  className={`rounded-sm border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-sm border border-line px-3 py-1.5 text-muted">
                  Previous
                </span>
              )}
              {list.page < list.totalPages ? (
                <Link
                  href={buildNewsletterHref({
                    status: list.status,
                    q: list.q,
                    page: list.page + 1,
                  })}
                  className={`rounded-sm border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-sm border border-line px-3 py-1.5 text-muted">
                  Next
                </span>
              )}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
