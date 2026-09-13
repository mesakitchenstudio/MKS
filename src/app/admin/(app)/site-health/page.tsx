import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAccess } from "@/lib/auth";
import {
  adminFocusRing,
  adminLinkClass,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import { loadSiteHealth } from "@/lib/site-health-server";
import {
  siteHealthCategoryLabel,
  siteHealthStatusLabel,
  type SiteHealthCategory,
  type SiteHealthCheck,
  type SiteHealthIssueGroup,
  type SiteHealthStatus,
} from "@/lib/site-health";

export const metadata: Metadata = {
  title: "Site Health",
};

export const dynamic = "force-dynamic";

function statusClass(status: SiteHealthStatus) {
  switch (status) {
    case "needs_attention":
      return "text-terracotta";
    case "recommendation":
      return "text-olive";
    case "unable_to_verify":
      return "text-muted";
    default:
      return "text-ink";
  }
}

function severityLabel(severity: "attention" | "recommendation") {
  return severity === "attention" ? "Needs attention" : "Recommendation";
}

const CATEGORY_ORDER: SiteHealthCategory[] = [
  "routing",
  "indexing",
  "canonical",
  "structured_data",
  "internal_link",
  "media",
];

function IssueGroupCard({ group }: { group: SiteHealthIssueGroup }) {
  return (
    <li className="border border-line bg-paper px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            {siteHealthCategoryLabel(group.category)} · {severityLabel(group.severity)}
          </p>
          <p className="mt-1 font-serif text-xl text-ink">
            {group.title}
            {group.count > 1 ? (
              <span className="ml-2 text-base text-muted">({group.count})</span>
            ) : null}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {group.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.id}-${issue.entityId || issue.entityLabel || index}`}>
                <span className="text-ink">
                  {issue.entityLabel || issue.entityId || "Detail"}
                </span>
                {" — "}
                {issue.description}
              </li>
            ))}
            {group.issues.length > 8 ? (
              <li>+{group.issues.length - 8} more</li>
            ) : null}
          </ul>
        </div>
        {group.issues[0]?.href ? (
          <Link
            href={group.issues[0].href}
            className={`${adminPrimaryButtonClass} ${adminFocusRing} shrink-0`}
          >
            Open tool
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function PassingChecks({ checks }: { checks: SiteHealthCheck[] }) {
  const passing = checks.filter((check) => check.passed);
  if (passing.length === 0) return null;
  return (
    <details className="border border-line bg-paper px-4 py-3">
      <summary className={`cursor-pointer text-sm font-semibold text-ink ${adminFocusRing}`}>
        {passing.length} checks passing
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        {passing.map((check) => (
          <li key={check.id}>
            <span className="text-ink">{check.title}</span>
            {check.detail ? ` — ${check.detail}` : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function AdminSiteHealthPage() {
  await requireAccess("content");
  const result = await loadSiteHealth();
  const { summary, groupedIssues, checks, status } = result;

  const failedChecks = checks.filter((check) => !check.passed);

  return (
    <div className="min-w-0 space-y-8">
      <AdminPageHeader
        title="Site Health"
        description="Technical discoverability for public Mesa routes — redirects, sitemap membership, robots/noindex policy, structured-data builders, and public relationships. Not a ranking score, Search Console, or Content Health."
        documentationTopicId="site-health"
        titleClassName="font-serif text-3xl text-ink"
        className="mb-0"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Site status
          </p>
          <p className={`mt-1 font-serif text-3xl ${statusClass(status)}`}>
            {siteHealthStatusLabel(status)}
          </p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Needs attention
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{summary.attentionCount}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Recommendations
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">{summary.recommendationCount}</p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Checks passing
          </p>
          <p className="mt-1 font-serif text-3xl text-ink">
            {summary.checksPassing}
            <span className="text-lg text-muted"> / {summary.checksTotal}</span>
          </p>
        </div>
      </div>

      {summary.issueCount === 0 ? (
        <p className="text-sm text-muted">
          No technical Site Health issues right now. Content readiness still lives under{" "}
          <Link href="/admin/content-health" className={`${adminLinkClass} ${adminFocusRing}`}>
            Content Health
          </Link>
          .
        </p>
      ) : null}

      {CATEGORY_ORDER.map((category) => {
        const groups = groupedIssues.filter((group) => group.category === category);
        if (groups.length === 0) return null;
        return (
          <section key={category} className="space-y-3" aria-labelledby={`site-health-${category}`}>
            <h2 id={`site-health-${category}`} className="font-serif text-2xl text-ink">
              {siteHealthCategoryLabel(category)}
            </h2>
            <ul className="space-y-3">
              {groups.map((group) => (
                <IssueGroupCard key={group.id} group={group} />
              ))}
            </ul>
          </section>
        );
      })}

      {failedChecks.length > 0 ? (
        <section className="space-y-3" aria-labelledby="site-health-failed">
          <h2 id="site-health-failed" className="font-serif text-2xl text-ink">
            Failed checks
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {failedChecks.map((check) => (
              <li key={check.id}>
                <span className="text-ink">{check.title}</span>
                {check.detail ? ` — ${check.detail}` : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PassingChecks checks={checks} />
    </div>
  );
}
