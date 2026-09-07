import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canViewAdminActivity, homeForRole } from "@/lib/admin-access";
import {
  humanizeAdminAuditAction,
  listAdminAuditEvents,
  type AdminAuditEventRow,
} from "@/lib/admin-audit";
import { adminInputClass, adminSecondaryButtonClass, adminWorkspaceWide } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Activity",
};

const AREA_OPTIONS = [
  { value: "", label: "All areas" },
  { value: "content", label: "Content" },
  { value: "members", label: "Members" },
  { value: "staff", label: "Staff" },
  { value: "youtube", label: "YouTube" },
] as const;

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dayHeading(date: Date, now = new Date()) {
  const key = dayKey(date);
  const today = dayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  if (key === today) return "Today";
  if (key === dayKey(yesterdayDate)) return "Yesterday";
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function timeLabel(date: Date) {
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function metadataSnippet(event: AdminAuditEventRow): string[] {
  const lines: string[] = [];
  const meta = event.metadata;
  if (typeof meta.oldSlug === "string" && typeof meta.newSlug === "string") {
    lines.push(`${meta.oldSlug} → ${meta.newSlug}`);
    if (meta.redirectCreated === true) lines.push("301 redirect created");
  }
  if (typeof meta.oldRole === "string" && typeof meta.newRole === "string") {
    lines.push(`${meta.oldRole} → ${meta.newRole}`);
  }
  if (typeof meta.oldStatus === "string" && typeof meta.newStatus === "string") {
    lines.push(`${meta.oldStatus} → ${meta.newStatus}`);
  }
  if (typeof meta.fromPath === "string" && typeof meta.toPath === "string") {
    lines.push(`${meta.fromPath} → ${meta.toPath}`);
  }
  if (Array.isArray(meta.changedFields) && meta.changedFields.length) {
    lines.push(`Changed: ${meta.changedFields.map(String).join(", ")}`);
  }
  return lines;
}

function groupByDay(events: AdminAuditEventRow[]) {
  const groups: { key: string; label: string; events: AdminAuditEventRow[] }[] = [];
  for (const event of events) {
    const key = dayKey(event.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, label: dayHeading(event.createdAt), events: [event] });
    }
  }
  return groups;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    area?: string;
    action?: string;
    person?: string;
  }>;
}) {
  const admin = await requireAccess("staff");
  if (!canViewAdminActivity(admin.role)) {
    redirect(homeForRole(admin.role));
  }

  const query = await searchParams;
  const q = String(query.q || "").trim();
  const area = String(query.area || "").trim();
  const action = String(query.action || "").trim();
  const person = String(query.person || "").trim();

  const events = await listAdminAuditEvents({
    take: 150,
    q: q || undefined,
    area: area || undefined,
    action: action || undefined,
    actorEmail: person || undefined,
  });

  const people = Array.from(
    new Map(
      events
        .filter((event) => event.actorEmail)
        .map((event) => [event.actorEmail, event.actorName || event.actorEmail] as const),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const actions = Array.from(new Set(events.map((event) => event.action))).sort();
  const groups = groupByDay(events);

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Activity</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Track important changes made by the Mesa team. Times in GMT.
        </p>
      </header>

      <form
        method="get"
        className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]"
      >
        <label className="block min-w-0">
          <span className="sr-only">Search</span>
          <input
            className={adminInputClass}
            name="q"
            defaultValue={q}
            placeholder="Search"
            type="search"
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Area</span>
          <select className={adminInputClass} name="area" defaultValue={area}>
            {AREA_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Action</span>
          <select className={adminInputClass} name="action" defaultValue={action}>
            <option value="">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {humanizeAdminAuditAction(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Person</span>
          <select className={adminInputClass} name="person" defaultValue={person}>
            <option value="">All people</option>
            {people.map(([email, name]) => (
              <option key={email} value={email}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={adminSecondaryButtonClass}>
          Filter
        </button>
      </form>

      {events.length === 0 ? (
        <p className="text-sm text-muted">No activity recorded yet.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {group.label}
              </h2>
              <ul className="divide-y divide-line/70 border-y border-line/70">
                {group.events.map((event) => {
                  const details = metadataSnippet(event);
                  const href = event.entityPath || "";
                  return (
                    <li key={event.id} className="grid gap-2 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-5">
                      <time
                        className="font-mono text-xs text-muted"
                        dateTime={event.createdAt.toISOString()}
                      >
                        {timeLabel(event.createdAt)}
                      </time>
                      <div className="min-w-0">
                        <p className="text-sm text-ink">
                          <span className="font-semibold">{event.actorName || "Staff"}</span>
                          <span className="text-muted"> · </span>
                          <span>{humanizeAdminAuditAction(event.action)}</span>
                        </p>
                        {event.entityLabel ? (
                          <p className="mt-1 text-sm text-ink">
                            {href ? (
                              <Link href={href} className="underline-offset-2 hover:underline">
                                {event.entityLabel}
                              </Link>
                            ) : (
                              event.entityLabel
                            )}
                          </p>
                        ) : null}
                        {details.length ? (
                          <div className="mt-2 space-y-1 text-sm text-muted">
                            {details.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
